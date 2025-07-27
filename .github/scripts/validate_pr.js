// .github/scripts/validate_pr.js

const core   = require('@actions/core');
const github = require('@actions/github');

// Wrap node-fetch in a dynamic import for CommonJS
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function run() {
  try {
    const token   = process.env.GITHUB_TOKEN;
    const octokit = github.getOctokit(token);
    const { owner, repo, number: prNumber } = github.context.issue;

    // 1. Fetch PR details (title, body, diff)
    const { data: pr } = await octokit.rest.pulls.get({
      owner, repo, pull_number: prNumber
    });
    const diff = await octokit.rest.pulls.get({
      owner, repo, pull_number: prNumber,
      mediaType: { format: 'diff' }
    }).then(res => res.data);

    // 2. Ensure JIRA link in PR body
    const jiraUrlRegex = /https:\/\/[^ ]+\/browse\/[A-Z]+\-\d+/;
    if (!jiraUrlRegex.test(pr.body || '')) {
      await octokit.rest.issues.createComment({
        owner, repo, issue_number: prNumber,
        body: "❌ Please include a JIRA story link (e.g. https://yourcompany.atlassian.net/browse/PROJ-123) in your PR body."
      });
      core.setFailed("Missing JIRA link");
      return;
    }
    const jiraLink = (pr.body.match(jiraUrlRegex) || [])[0];
    const jiraKey  = jiraLink.split('/').pop();

    // 3. Fetch JIRA story details
    const jiraAuth = Buffer.from(
      `${process.env.JIRA_USER_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    const jiraRes  = await fetch(
      `https://${process.env.JIRA_HOST}/rest/api/3/issue/${jiraKey}`,
      {
        headers: {
          'Authorization': `Basic ${jiraAuth}`,
          'Accept': 'application/json'
        }
      }
    );
    const jiraJson = await jiraRes.json();
    const jiraSummary     = jiraJson.fields.summary;
    const jiraDescription = jiraJson.fields.description?.content
      .map(block => block.content?.map(c => c.text).join(''))
      .join('\n') || '';

    // 4. Build prompt for Mistral
    const prompt = `
Compare these two items and return JSON: {"score": <0-100>, "comment": "<short justification>"}

1. PR context:
Title: ${pr.title}
Body: ${pr.body}
Diff:
${diff}

2. JIRA story:
Summary: ${jiraSummary}
Description:
${jiraDescription}
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

    let result = { score: 0, comment: 'Unable to parse AI response.' };
    try {
      result = JSON.parse(aiReply);
    } catch {
      core.warning(`AI response not valid JSON:\n${aiReply}`);
    }

    // 5. Post result back to PR
    const status  = result.score >= 80 ? '✅ PASSED' : '⚠️ BELOW THRESHOLD';
    const message = `
**JIRA Validation**: ${status}  
Score: ${result.score}%  
${result.comment}
    `;
    await octokit.rest.issues.createComment({
      owner, repo, issue_number: prNumber, body: message
    });

    if (result.score < 80) {
      core.setFailed(`Context match ${result.score}% is below threshold`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
