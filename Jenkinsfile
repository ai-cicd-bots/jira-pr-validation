pipeline {
  agent any

  // Trigger on GitHub PR‐webhook with your Generic Token
  triggers {
    GenericTrigger(
      token: 'prvalidation',
      printPostContent: true,
      printContributedVariables: true,
      genericVariables: [
        // Instead of PR_OWNER, capture the GitHub org/user that owns the repo:
        [ key: 'ORG_NAME', value: '$.repository.owner.login' ],
        [ key: 'PR_REPO',  value: '$.repository.name'        ],
        [ key: 'PR_NUMBER', value: '$.pull_request.number'   ]
      ]
    )
  }

  // Inject your long-lived secrets as environment vars
  environment {
    GITHUB_API_KEY  = credentials('GITPAT_FOR_ai-cicd-bots')            // Octokit auth
    MISTRAL_API_KEY = credentials('MISTRAL_API_KEY')   // Mistral AI key
    JIRA_API_URL    = credentials('JIRA_URL')          //GITPAT_FOR_ai-cicd-bots/ e.g. https://your-org.atlassian.net
  }

  stages {
    stage('Validate PR') {
      steps {
        // Bind JIRA user/email & API token
        withCredentials([
          usernamePassword(
            credentialsId: 'jira-creds',
            usernameVariable: 'JIRA_USER_EMAIL',
            passwordVariable: 'JIRA_API_KEY'
          )
        ]) {
          echo "Running PR Validator on ${ORG_NAME}/${PR_REPO}#${PR_NUMBER}"
          sh """
            cd  /home/AI-SDP-PLATFORM/ai-pr-validator
            node app.js \
              --repo ${ORG_NAME}/${PR_REPO} \
              --pr   ${PR_NUMBER}
          """
        }
      }
    }
  }

  post {
    success {
      echo '✅ PR validation passed.'
    }
    failure {
      echo '❌ PR validation failed—check the logs above for details.'
    }
  }
}
