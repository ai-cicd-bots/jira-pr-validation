const core   = require('@actions/core');
const github = require('@actions/github');
const fetch  = require('node-fetch');

async function run() {
  const token   = process.env.GITHUB_TOKEN;
  const octokit = github.getOctokit(token);
  const { owner, repo, number: prNumber } = github.context.issue;

  // 1. Fetch PR details (title, body, diff)
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  const diff = await octokit.rest.pulls.get({
    owner, repo, pull_number: prNumber, mediaType: { format: 'diff' }
  }).then(res => res.data);

  // 2. Ensure JIRA link in PR comments or body
  const jiraUrlRegex = /https:\/\/[^ ]+\/browse\/[A-Z]+\-\d+/;
  const commentFeed = pr.body + '\n';
  if (!jiraUrlRegex.test(commentFeed)) {
    await octokit.rest.issues.createComment({
      owner, repo, issue_number: prNumber,
      body: "❌ Please include a JIRA story link (e.g. https://yourcompany.atlassian.net/browse/PROJ-123) in your PR body before approval."
    });
    core.setFailed("Missing JIRA link");
    return;
  }
  const jiraLink = commentFeed.match(jiraUrlRegex)[0];
  const jiraKey  = jiraLink.split('/').pop();

  // 3. Fetch JIRA story details
  const jiraAuth = Buffer.from(`${process.env.JIRA_USER_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  const jiraRes  = await fetch(`https://${process.env.JIRA_HOST}/rest/api/3/issue/${jiraKey}`, {
    headers: { 'Authorization': `Basic ${jiraAuth}`, 'Accept': 'application/json' }
  });
  const jiraJson = await jiraRes.json();
  const jiraSummary     = jiraJson.fields.summary;
  const jiraDescription = jiraJson.fields.description?.content
                           .map(block => block.content?.map(c => c.text).join(''))
                           .join('\n') || '';

  // 4. Ask Mistral to compare contexts
  const prompt = `
Compare the following two items and return a JSON with keys "score" (0–100) and "comment":
1. PR context (title + body + diff):
${pr.title}
${pr.body}
${diff}

2. JIRA story summary + description:
${jiraSummary}
${jiraDescription}

Output:
{"score": <number>, "comment": "<short justification>"}
  `.trim();

  const mistRes = await fetch('https://api.mistral.ai/v1/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-7b-instruct',
      prompt,
      max_tokens: 200
    })
  });
  const mistJson = await mistRes.json();
  const aiReply  = mistJson.choices?.[0]?.text?.trim();
  let result     = { score: 0, comment: 'Could not parse AI response.' };

  try {
    result = JSON.parse(aiReply);
  } catch {
    // leave default
  }

  // 5. Post result back to PR
  const verdict = result.score >= 80 ? '✅ PASSED' : '⚠️ BELOW THRESHOLD';
  const body    = `
**JIRA Validation Result**: ${verdict}  
Score: ${result.score}%  
${result.comment}
  `;
  await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
  
  // fail the check if below threshold
  if (result.score < 80) {
    core.setFailed(`Context match ${result.score}% is below 80%`);
  }
}

run().catch(err => {
  core.setFailed(err.message);
});
