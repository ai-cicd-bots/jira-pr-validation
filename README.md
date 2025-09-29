# AI-Powered PR Validator

Automate your pull request (PR) validation by comparing PRs against linked JIRA stories and providing AI-driven code review comments. This Node.js tool integrates with GitHub, JIRA, and Mistral AI, and can be invoked locally or in a Jenkins pipeline.

---

## Architecture

<img width="1146" height="582" alt="image" src="https://github.com/user-attachments/assets/d3805dfb-5ae8-4d69-ac82-549aa5c7ab1b" />


---

## Features

- Extracts JIRA issue key from PR description  
- Fetches JIRA story summary & description via JIRA REST API  
- Retrieves PR metadata and diff using Octokit  
- Uses Mistral AI to compute context match percentage and generate code review comments  
- Posts a consolidated comment on the GitHub PR  
- Fails the pipeline if the match percentage is below a configurable threshold  

---

## Prerequisites

- Node.js v14+ (tested on v18.19.1)  
- A Mistral AI API key  
- A GitHub Personal Access Token with `repo` scope  
- A JIRA user email + API token  
- (Optional) Jenkins with the **Generic Webhook Trigger** plugin  

---

## Setup

1. **Clone the repo**  
   ```bash
   git clone https://github.com/ai-cicd-bots/ai-pr-validator.git
   cd ai-pr-validator
   ```

2. **Create a `.env` file** in the project root:  
   ```dotenv
   GITHUB_API_KEY=ghp_your_github_token
   MISTRAL_API_KEY=mis_your_mistral_key
   JIRA_API_URL=https://your-org.atlassian.net
   JIRA_USER_EMAIL=you@company.com
   JIRA_API_KEY=your_jira_api_token
   ```

3. **Install dependencies**  
   ```bash
   npm ci
   ```

---

## Running Locally

Invoke the validator against any repo/PR combination:

```bash
node app.js --repo owner/repo --pr 42
```

- `--repo` must be in `owner/name` format  
- `--pr` is the pull request number  

The script will exit with code `0` on success or `1` if the match percentage is below the threshold (default 80%).

---

## Jenkins Integration

Use this snippet in your **Jenkinsfile** to trigger PR validation via a GitHub webhook:

```groovy
pipeline {
  agent any

  triggers {
    GenericTrigger(
      token: 'prvalidation',
      printPostContent: true,
      printContributedVariables: true,
      genericVariables: [
        [ key: 'ORG_NAME',  value: '$.repository.owner.login' ],
        [ key: 'PR_REPO',   value: '$.repository.name'       ],
        [ key: 'PR_NUMBER', value: '$.pull_request.number'   ]
      ]
    )
  }

  environment {
    GITHUB_API_KEY  = credentials('GitAPI')
    MISTRAL_API_KEY = credentials('MISTRAL_API_KEY')
    JIRA_API_URL    = credentials('JIRA_URL')
  }

  stages {
    stage('Validate PR') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'jira-creds',
            usernameVariable: 'JIRA_USER_EMAIL',
            passwordVariable: 'JIRA_API_KEY'
          )
        ]) {
          echo "Validating ${ORG_NAME}/${PR_REPO}#${PR_NUMBER}"
          sh """
            node /home/AI_SDP_PLATFORM/ai-pr-validator/app.js \
              --repo ${ORG_NAME}/${PR_REPO} \
              --pr   ${PR_NUMBER}
          """
        }
      }
    }
  }

  post {
    success { echo '✅ PR validation passed.' }
    failure { echo '❌ PR validation failed—see console logs and PR comments.' }
  }
}
```

---

## Configuration

- **Threshold**: Adjust the failure threshold in `app.js` (default `80%`).  
- **Model**: Change the Mistral model in `getPercentageMatch` and `getCodeReviewComments`.  
- **Logging**: Enable or disable debug logging by commenting out the `console.log` statements.

## Webhook Configurations

<img width="935" height="393" alt="image" src="https://github.com/user-attachments/assets/1574bd41-4ef4-4148-880c-5c8a2f366b89" />

---

## Contributing

1. Fork this repository  
2. Create your feature branch (`git checkout -b feature/xyz`)  
3. Commit your changes (`git commit -m 'Add xyz'`)  
4. Push to your branch (`git push origin feature/xyz`)  
5. Open a Pull Request for review  

---

🚀 How It Works

Developer references a JIRA ticket in the PR description.
Validator fetches the story summary and code diff in seconds.
AI computes a “Context Match Score” to ensure alignment.
Inline comments highlight potential misalignment, style issues, or missing tests.
A consolidated summary report and score are posted back to the PR automatically.


✨ Core Features

Context Alignment – Quantify how well your code addresses the linked JIRA story.
AI-Generated Feedback – Targeted inline suggestions for clarity, style, and edge cases.
Customizable Thresholds – Define your pass/fail score to enforce standards automatically.
Minimal Setup – A single CLI command or CI hook activates powerful validation.
Extensible & Secure – Runs in your own Node.js environment, no external code exposure.


🧰 Tech Stack






























ComponentTechnologyRoleValidator CoreNode.js (ESM Modules)GitHub & JIRA API orchestration, score computationAI EngineMistral AINatural-language comparison & review comment generationAuthenticationOAuth & API TokensSecure access to GitHub and JIRACLI InterfaceCommander.jsConfigurable flags, environment support

✅ Key Benefits

Accelerated Reviews – Cut review meetings by up to 50% with AI-driven suggestions.
Higher Code Quality – Surface missing tests, edge cases, and style inconsistencies instantly.
Feature Confidence – Ensure every change maps directly back to planned requirements.
Reduced Rework – Catch misalignments early, save hours of back-and-forth comments.
Scalable Governance – Apply consistent standards across dozens of teams and projects.


📈 Productivity Impact
By automating context checks and primary review tasks, engineering teams reclaim focus on innovation instead of administrative overhead.

Onboarding accelerates when new joiners receive clear, AI-backed guidance.
Senior engineers spend less time on routine feedback and more time mentoring or architecting strategic features.
The net result: faster cycle times, fewer hotfixes, and a measurable uptick in deployment frequency.


💡 Ready to Transform Your PR Workflow?
Experience the future of code review—where AI amplifies your team’s expertise and eliminates friction.
Get started in minutes with our open-source CLI or schedule a demo for enterprise support and advanced customization.


<img width="757" height="399" alt="image" src="https://github.com/user-attachments/assets/4d27c498-9cf6-423f-9a04-6178fc4ea5e2" />


🔗 References

Sample PR: https://github.com/ai-cicd-bots/jira-pr-validation/pull/9
Jenkins Job: Jenkins Job
JIRA Story: [Update Application Title](https://shakil-ahamed.atlassian.net/browse/ADUN-7)

