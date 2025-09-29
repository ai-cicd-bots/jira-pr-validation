require('dotenv').config()
const { Octokit } = require('@octokit/rest')
const fetch        = require('node-fetch')
const yargs        = require('yargs/yargs')
const { hideBin }  = require('yargs/helpers')

// CLI args
const { repo: repoArg, pr: prNumber } = yargs(hideBin(process.argv))
  .option('repo', { type: 'string', demandOption: true, describe: 'owner/name' })
  .option('pr',   { type: 'number', demandOption: true, describe: 'PR number' })
  .argv

// Env vars
const {
  GITHUB_API_KEY,
  JIRA_API_URL,
  JIRA_USER_EMAIL,
  JIRA_API_KEY,
  AZURE_API_KEY,
  AZURE_API_BASE,
  AZURE_API_VERSION,
  AZURE_DEPLOYMENT_MODEL
} = process.env

if (!GITHUB_API_KEY || !JIRA_API_URL || !JIRA_USER_EMAIL || !JIRA_API_KEY ||
    !AZURE_API_KEY || !AZURE_API_BASE || !AZURE_API_VERSION || !AZURE_DEPLOYMENT_MODEL) {
  console.error('🔒 Missing one of required environment variables.')
  process.exit(1)
}

const [owner, repo] = repoArg.split('/')
if (!owner || !repo) {
  console.error(`❌ Invalid repo format: "${repoArg}". Use "owner/name".`)
  process.exit(1)
}

const octokit = new Octokit({ auth: GITHUB_API_KEY })
const jiraAuth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_KEY}`).toString('base64')

console.log(`▶️ Validating PR #${prNumber} on ${owner}/${repo}`)

// Retry helper
async function retryWithBackoff(fn, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (err.message.includes('429') && i < retries - 1) {
        const wait = delay * Math.pow(2, i)
        console.warn(`⏳ Rate limit hit. Retrying in ${wait / 1000}s...`)
        await new Promise(res => setTimeout(res, wait))
      } else {
        throw err
      }
    }
  }
}

// Helpers
async function fetchPRAndDiff() {
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  const diff = await octokit.pulls.get({
    owner, repo, pull_number: prNumber,
    mediaType: { format: 'diff' }
  }).then(r => r.data)
  return { pr, diff }
}

async function fetchJiraStory(jiraKey) {
  const res = await fetch(`${JIRA_API_URL}/rest/api/3/issue/${jiraKey}`, {
    headers: {
      Authorization: `Basic ${jiraAuth}`,
      Accept:        'application/json'
    },
    timeout: 10000
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`JIRA API ${res.status}: ${txt || res.statusText}`)
  }
  const json = await res.json()
  const summary     = json.fields.summary
  const description = (json.fields.description?.content || [])
    .flatMap(block => block.content.map(c => c.text))
    .join('\n')
  return { summary, description }
}

function stripFences(markdown) {
  return markdown
    .replace(/```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
}

async function callAzureOpenAI(prompt) {
  const url = `${AZURE_API_BASE}/openai/deployments/${AZURE_DEPLOYMENT_MODEL}/chat/completions?api-version=${AZURE_API_VERSION}`

  const payload = {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 3200
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY
    },
    body: JSON.stringify(payload),
    timeout: 30000
  })

  console.log(`⚙️ Azure call status: ${res.status}`)
  const raw = await res.text()
  console.log('⚙️ Azure raw response:', raw)

  if (!res.ok) {
    throw new Error(`Azure API error ${res.status}: ${raw}`)
  }

  const chat = JSON.parse(raw)
  let content = chat.choices?.[0]?.message?.content || ''
  content = stripFences(content)
  return content
}

async function getPercentageMatch({ summary, description, pr, diff }) {
  const prompt = `
Compare this PR to its linked JIRA story and give a percentage match (0–100).
Return JSON: { "score":<number>, "comment":"<text>" }

JIRA Summary:
${summary}

JIRA Description:
${description}

PR Title:
${pr.title}

PR Body:
${pr.body}

Diff:
${diff}`.trim()

  const content = await retryWithBackoff(() => callAzureOpenAI(prompt))
  try {
    return JSON.parse(content)
  } catch (e) {
    throw new Error(`Failed to parse similarity JSON: ${e.message}\n-- JSON was --\n${content}`)
  }
}

async function getCodeReviewComments(diff) {
  const prompt = `
You are an expert code reviewer. Provide actionable comments on this diff.
Return JSON: { "comments":[ { "file":"<path>", "line":<num>, "comment":"<text>" } ] }

Diff:
${diff}`.trim()

  const content = await retryWithBackoff(() => callAzureOpenAI(prompt))
  try {
    return JSON.parse(content).comments
  } catch (e) {
    throw new Error(`Failed to parse review JSON: ${e.message}\n-- JSON was --\n${content}`)
  }
}

// Main
async function run() {
  const { pr, diff } = await fetchPRAndDiff()

  const m = (pr.body || '').match(/browse\/([A-Z]+-\d+)/)
  if (!m) throw new Error('No JIRA link found in PR body')
  const jiraKey = m[1]
  console.log(`🔗 Found JIRA ticket: ${jiraKey}`)

  const { summary, description } = await fetchJiraStory(jiraKey)

  console.log('🧠 Calculating similarity…')
  const { score, comment } = await getPercentageMatch({ summary, description, pr, diff })
  console.log(`📊 Similarity: ${score}%`)

  console.log('🧠 Gathering code review comments…')
  const comments = await getCodeReviewComments(diff)

  let body = `### 🤖 JIRA Similarity: **${score}%**\n\n${comment}\n\n---\n**Code Review Comments:**\n`
  comments.forEach(c => {
    body += `- **${c.file}**:${c.line} → ${c.comment}\n`
  })

  await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body })
  console.log('✅ Posted similarity & review.')

  if (score < 80) {
    console.error(`❗ Similarity ${score}% < 80% → failing.`)
    process.exit(1)
  }
}

run().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
