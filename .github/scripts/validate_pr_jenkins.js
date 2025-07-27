// .github/scripts/validate_pr_jenkins.js

const core   = require('@actions/core');
const github = require('@actions/github');
const fetch  = require('node-fetch');  // v2.x, CJS

async function run() {
  try {
    // Extract info from Jenkins env
    const gitUrl   = process.env.GIT_URL;              // e.g. https://github.com/org/repo.git
    const [, owner, repo] = gitUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    const prNumber = process.env.CHANGE_ID;            // Jenkins PR build number

    if (!prNumber) {
      throw new Error('CHANGE_ID not set; not a pull request build');
    }

    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

    // 1) Fetch PR details & diff
    const { data: pr } = await octokit.rest.pulls.get({
      owner, repo, pull_number: prNumber
    });
    const diff = await octokit.rest.pulls.get({
      owner, repo, pull_number: prNumber,
      mediaType: { format: 'diff' }
    }).then(r => r.data);

    // (Continue with your existing steps: JIRA link regex, fetch JIRA, call Mistral, comment…)

    // — Example snippet for JIRA fetch:
    const jiraKey = pr.body.match(/([A-Z]+-\d+)/)[0];
    const jiraUrl = `https://${process.env.JIRA_HOST}/rest/api/3/issue/${jiraKey}`;
    const auth   = Buffer.from(
      `${process.env.JIRA_USER_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    const jiraRes = await fetch(jiraUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept':        'application/json'
      },
      timeout: 10000
    });

    if (!jiraRes.ok) {
      const text = await jiraRes.text().catch(() => '');
      throw new Error(`JIRA API ${jiraRes.status}: ${text}`);
    }
    const jiraJson = await jiraRes.json();

    // …then call Mistral, parse JSON, issue GitHub comment, set failure if below threshold.

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
