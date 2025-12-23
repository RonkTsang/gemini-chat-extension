/**
 * Content Creation Templates
 * Default templates for content creation
 */

import type { DefaultTemplate } from './index'

export const contentCreationTemplates: DefaultTemplate[] = [
  {
    id: 'multi-platform-content-creation',
    name: '📝 Multi-Platform Content Creation',
    description: 'Create one piece of content (e.g. a news commentary or blog post) and repurpose it automatically for different social media platforms such as Twitter, LinkedIn, and RedNote.',
    category: 'content-creation',
    tags: ['Content Creation', 'Multi-Platform', 'Social Media', 'Repurposing'],
    difficulty: 'beginner',
    estimatedTime: '3-5minutes',
    variables: [
      { key: 'TOPIC', defaultValue: 'AI technology' },
      { key: 'TONE', defaultValue: 'professional tone' },
    ],
    steps: [
      {
        id: 'step-1',
        name: '📰 Fetch Trending Topic',
        prompt: 'Search for one of the most trending news topics within the last 24 hours related to {{TOPIC}}. Return a short summary (max 100 words).'
      },
      {
        id: 'step-2', 
        name: '📝 Blog-Style Rewrite',
        prompt: 'Rewrite the news summary as a blog-style post (300–400 words) in a {{TONE}}. Add a compelling title and 3 SEO keywords.'
      },
      {
        id: 'step-3',
        name: '🎯 Platform Adaptation',
        prompt: `Now, rewrite the same content for the following platforms:
1. Twitter (X) — concise version in English, under 280 characters, with a hook and 2 hashtags.  
2. LinkedIn — professional tone, structured with short paragraphs, ending with a question to drive engagement.  
3. Reddit - short post with a hook and 2 subreddits to target.`
      },
      {
        id: 'step-4',
        name: '💯 Schedule & Output Format',
        prompt: `Output all versions in a structured table:

| Platform | Tone | Length | Example Post/Text |`
      }
    ],
    preview: {
      exampleOutput: 'A structured table with all versions of the content for different platforms'
    }
  },
  {
    id: 'blog-article-generator',
    name: '📝 Blog Article Generator',
    description: 'Automated writing workflow from topic to complete article, including title generation, outline creation, introduction writing, and body completion',
    category: 'content-creation',
    tags: ['Writing', 'Blog', 'Article', 'Content Creation'],
    difficulty: 'beginner',
    estimatedTime: '3-5 minutes',
    variables: [
      { key: 'TOPIC', defaultValue: 'The future development of artificial intelligence' },
      { key: 'TONE', defaultValue: 'professional yet accessible' },
      { key: 'LENGTH', defaultValue: '800 words' }
    ],
    steps: [
      {
        id: 'step-1',
        name: '📋 Generate Titles',
        prompt: 'Generate 5 compelling titles for a blog article about "{{TOPIC}}" in a {{TONE}} style.'
      },
      {
        id: 'step-2', 
        name: '📝 Create Outline',
        prompt: 'Select the best title from above and create a detailed writing outline for it'
      },
      {
        id: 'step-3',
        name: '✍️ Write Introduction',
        prompt: 'Based on the outline, write an engaging opening paragraph for the article, approximately 200 words in {{TONE}} style'
      },
      {
        id: 'step-4',
        name: '📄 Complete Body',
        prompt: 'Based on the outline and introduction above, complete the main body of the article, approximately {{LENGTH}} in total'
      }
    ],
    preview: {
      exampleOutput: 'Complete blog article including title, outline, introduction, and body'
    }
  },
  {
    id: 'product-description-optimizer',
    name: '🏷️ Product Description Optimizer',
    description: 'Transform product information into compelling product descriptions, including selling point extraction, description optimization, and marketing copy',
    category: 'content-creation',
    tags: ['Product', 'Marketing', 'Description', 'E-commerce'],
    difficulty: 'intermediate',
    estimatedTime: '2-4 minutes',
    variables: [
      { key: 'PRODUCT_NAME', defaultValue: 'Smart Watch' },
      { key: 'FEATURES', defaultValue: 'Health monitoring, fitness tracking, smart notifications' },
      { key: 'TARGET_MARKET', defaultValue: 'Fitness enthusiasts' }
    ],
    steps: [
      {
        id: 'step-1',
        name: '💎 Extract Selling Points',
        prompt: 'Analyze the core selling points of the product "{{PRODUCT_NAME}}", main features: {{FEATURES}}, target market: {{TARGET_MARKET}}.'
      },
      {
        id: 'step-2',
        name: '✨ Optimize Description',
        prompt: 'Based on the selling points above, create an attractive product description, you can try to combine the theories of marketing and social psychology.'
      },
      {
        id: 'step-3',
        name: '📢 Add Marketing Copy',
        prompt: 'Add marketing copy and call-to-action to the product description'
      },
      {
        id: 'step-4',
        name: '📋 Finalize Output',
        prompt: 'Integrate and output the optimized product description and marketing copy, and refine the final format'
      }
    ],
    preview: {
      exampleOutput: 'Optimized product description and marketing copy'
    }
  }
]
