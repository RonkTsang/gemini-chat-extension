/**
 * Business Office Templates
 * Default templates for business and office use
 */

import type { DefaultTemplate } from './index'

export const businessOfficeTemplates: DefaultTemplate[] = [
  {
    id: 'investment-research-company-analysis-chain',
    name: '📊 Investment Research & Company Analysis Chain',
    description: 'Automate the process of researching and analyzing a company for long-term or value investing purposes.',
    category: 'business-office',
    tags: ['Investment Research', 'Company Analysis', 'Long-term Investing', 'Value Investing'],
    difficulty: 'beginner',
    estimatedTime: '2-3minutes',
    variables: [
      { key: 'COMPANY_NAME', defaultValue: 'Apple' }
    ],
    steps: [
      {
        id: 'step-1',
        name: '🏢 Fetch Company Overview',
        prompt: 'Search for the latest public information on the company {{COMPANY_NAME}}. Summarize: business model, main revenue sources, and core products.'
      },
      {
        id: 'step-2',
        name: '🔍 Financial Summary',
        prompt: `Search, collect and summarize key financial metrics:
- Revenue, Net Income, Free Cash Flow (latest fiscal year)
- YoY growth rates
- Debt ratio and cash position
        `
      },
      {
        id: 'step-3',
        name: '💪 Moat & Competitive Advantage Analysis & Risk',
        prompt: `Analyze the company’s competitive advantages (moat) in terms of:
- Brand power
- Cost structure
- Technology / patents
- Switching costs
And List 3 key risk factors and 3 potential growth drivers for the next 2–3 years.
        `
      },
      {
        id: 'step-4',
        name: '📈 Valuation Snapshot',
        prompt: `Estimate valuation ratios (P/E, P/B, P/S, EV/EBITDA) and compare with industry peers.
Summarize whether the company seems overvalued, fairly valued, or undervalued.`
      },
      {
        id: 'step-5',
        name: '💬 Summary',
        prompt: `Conclude the investment summary in the style of Warren Buffett / Charlie Munger.`
      }
    ],
    preview: {
      exampleOutput: 'A structured analysis of the company, including overview, financial summary, competitive advantage analysis, valuation snapshot, and outlook summary'
    }
  },
  {
    id: 'email-summarization-and-insight-chain',
    name: '📧 Email Summarization & Insight Chain',
    description: 'Automatically summarize incoming emails, classify them by importance, and generate concise reply drafts',
    category: 'business-office',
    tags: ['Email Summarization', 'Priority Classification', 'Reply Draft'],
    difficulty: 'beginner',
    estimatedTime: '2-3minutes',
    variables: [],
    steps: [
      {
        id: 'step-1',
        name: '📨 Retrieve Emails and Summary',
        prompt: `@Gamil Fetch unread emails from the past 12 hours (sender, subject, body preview). For each email, summarize in ≤50 words:
- Who sent it
- Main topic
- Required action or request`
      },
      {
        id: 'step-2',
        name: '🔝 Priority Classification',
        prompt: `Assign priority levels using Eisenhower Matrix logic:
🔴 Urgent & Important
🟡 Important but not Urgent
🟣 Urgent but not Important
🟢 Neither`
      },
      {
        id: 'step-3',
        name: '💬 Output Structure',
        prompt: `Suggested Reply or action-oriented, and output the results in a structured table:
| Sender | Subject | Summary | Priority | Suggested Reply |`
      }
    ],
    preview: {
      exampleOutput: 'A structured table with all emails, their summaries, priorities, and suggested replies'
    }
  },
]
