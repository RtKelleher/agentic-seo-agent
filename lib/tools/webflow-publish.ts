import type { ToolDefinition, AppConfig } from '../types'
import { readJSON, getActiveProjectId } from '../store'
import { marked } from 'marked'

export const definition: ToolDefinition = {
  name: 'publish_to_webflow',
  description:
    'Publish an article draft to the connected Webflow CMS collection. The item is created as a DRAFT — it will not go live until manually published in Webflow. Accepts markdown content which is converted to HTML automatically.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The article title',
      },
      slug: {
        type: 'string',
        description: 'URL slug for the article (lowercase, hyphens, no spaces)',
      },
      content: {
        type: 'string',
        description: 'The article content in markdown format',
      },
      field_mapping: {
        type: 'object',
        description:
          'Optional additional field mappings for the CMS collection (e.g. {"summary": "Brief description", "author": "John"})',
      },
    },
    required: ['title', 'slug', 'content'],
  },
}

function sanitizeHtml(html: string): string {
  // Strip class, id, and style attributes
  let cleaned = html.replace(/\s+(class|id|style)="[^"]*"/gi, '')
  // Fix Webflow list whitespace bug: ensure <li> content is trimmed
  cleaned = cleaned.replace(/<li>\s+/g, '<li>').replace(/\s+<\/li>/g, '</li>')
  return cleaned
}

export async function execute(args: Record<string, unknown>): Promise<string> {
  const title = args.title as string
  const slug = args.slug as string
  const content = args.content as string
  const fieldMapping = (args.field_mapping as Record<string, unknown>) || {}

  // Load active project config
  const projectId = await getActiveProjectId()
  const config = await readJSON<AppConfig>('config.json')
  const project = config.projects.find((p) => p.id === projectId)

  if (!project?.webflowApiToken || !project?.webflowCollectionId) {
    // Graceful fallback — return content as formatted text
    const htmlContent = sanitizeHtml(await marked.parse(content))
    return (
      `Webflow is not configured for this project. Here is the article ready for manual publishing:\n\n` +
      `**Title:** ${title}\n` +
      `**Slug:** ${slug}\n\n` +
      `---\n\n` +
      `### HTML Content\n\n\`\`\`html\n${htmlContent}\n\`\`\`\n\n` +
      `To enable direct publishing, connect Webflow from the Site Profile page.`
    )
  }

  // Convert markdown to HTML and sanitize
  const htmlContent = sanitizeHtml(await marked.parse(content))

  // Build the CMS item payload
  const fieldData: Record<string, unknown> = {
    name: title,
    slug,
    ...fieldMapping,
  }

  // Try common content field names
  // Check schema to find the right rich-text field, fallback to common names
  const contentFieldCandidates = ['post-body', 'body', 'content', 'article-body', 'post-content']
  const schemaHint = project.webflowSchemaMd || ''
  let contentField = contentFieldCandidates[0]
  for (const candidate of contentFieldCandidates) {
    if (schemaHint.includes(`| ${candidate} |`)) {
      contentField = candidate
      break
    }
  }
  fieldData[contentField] = htmlContent

  try {
    const res = await fetch(
      `https://api.webflow.com/v2/collections/${project.webflowCollectionId}/items`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${project.webflowApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isArchived: false,
          isDraft: true,
          fieldData,
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return `Failed to publish to Webflow (${res.status}): ${errText}\n\nThe article content is ready — you can try again or publish manually.`
    }

    const result = await res.json()
    return (
      `Successfully published draft to Webflow!\n\n` +
      `**Item ID:** ${result.id}\n` +
      `**Title:** ${title}\n` +
      `**Slug:** ${slug}\n` +
      `**Status:** Draft (not live)\n\n` +
      `The article is saved as a draft in your Webflow CMS. Log into Webflow to review and publish it.`
    )
  } catch (err) {
    return `Error connecting to Webflow: ${err instanceof Error ? err.message : 'Unknown error'}\n\nThe article content is ready for manual publishing.`
  }
}
