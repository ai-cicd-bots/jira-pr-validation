// Use Node 18+'s global fetch—no node-fetch import required
const core   = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token   = process.env.GITHUB_TOKEN;
    const octokit = github.getOctokit(token);
    const { owner, repo, number: prNumber } = github.context.issue;

    // 1) Fetch PR data + diff
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    const diff = await octokit.rest.pulls.get({
      owner, repo, pull_number: prNumber,
      mediaType: { format: 'diff' }
    }).then(res => res.data);

    // 2) Check for JIRA link
    const bodyText     = pr.body || '';
    const jiraUrlRegex = /https:\/\/[^ ]+\/browse\/[A-Z]+-\d+/;
    if (!jiraUrlRegex.test(bodyText)) {
      await octokit.rest.issues.createComment({
        owner, repo, issue_number: prNumber,
        body: "❌ Please include a JIRA story link (e.g. https://yourcompany.atlassian.net/browse/PROJ-123) in your PR body."
      });
      core.setFailed("Missing JIRA link in PR body");
      return;
    }
    const jiraLink = bodyText.match(jiraUrlRegex)[0];
    const jiraKey  = jiraLink.split('/').pop();

    // 3) Pull JIRA details
    const jiraAuth = Buffer.from(
      `${process.env.JIRA_USER_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');
    const jiraRes = await fetch(
      `https://${process.env.JIRA_HOST}/rest/api/3/issue/${jiraKey}`,
      {
        headers: {
          'Authorization': `Basic ${jiraAuth}`,
          'Accept':        'application/json'
        }
      }
    );
    if (!jiraRes.ok) {
      throw new Error(`JIRA API returned ${jiraRes.status}`);
    }
    const jiraJson        = await jiraRes.json();
    const jiraSummary     = jiraJson.fields.summary;
    const jiraDescription = (jiraJson.fields.description?.content || [])
      .map(block => block.content?.map(c => c.text).join(''))
      .join('\n');

    // 4) Send prompt to Mistral
    const prompt = `
Compare the following two items and return JSON: {"score": <0-100>, "comment": "<brief justification>"}

1) PR
Title: ${pr.title}
Body: ${pr.body}
Diff:
${diff}

2) JIRA Story
Summary: ${jiraSummary}
Description:
${jiraDescription}
    `.trim();

    const mistRes = await fetch('https://api.mistral.ai/v1/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model:      'mistral-7b-instruct',
        prompt,
        max_tokens: 200
      })
    });
    const mistJson = await mistRes.json();
    const aiReply  = mistJson.choices?.[0]?.text.trim() || '';

    // 5) Parse & post result
    let result = { score: 0, comment: 'Could not parse AI response.' };
    try {
      result = JSON.parse(aiReply);
    } catch {
      core.warning(`Invalid JSON from AI:\n${aiReply}`);
    }

    const verdict = result.score >= 80 ? '✅ PASSED' : '⚠️ BELOW THRESHOLD';
    const comment = `
**JIRA Validation**: ${verdict}  
Score: ${result.score}%  
${result.comment}
    `;
    await octokit.rest.issues.createComment({
      owner, repo, issue_number: prNumber, body: comment
    });

    if (result.score < 80) {
      core.setFailed(`Match score ${result.score}% is below 80%`);
    }

  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
