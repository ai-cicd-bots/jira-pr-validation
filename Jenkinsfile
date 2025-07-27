pipeline {
  agent any

  environment {
    GITHUB_TOKEN    = credentials('github-token')
    MISTRAL_API_KEY = credentials('mistral-api-key')
    JIRA_HOST       = 'yourcompany.atlassian.net'
  }

  parameters {
    string(name: 'PR_OWNER',   defaultValue: '', description: 'GitHub org/user')
    string(name: 'PR_REPO',    defaultValue: '', description: 'GitHub repo slug')
    string(name: 'PR_NUMBER',  defaultValue: '', description: 'Pull request number')
  }

  stages {
    stage('Run Central Validator') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'jira-creds',
            usernameVariable: 'JIRA_USER_EMAIL',
            passwordVariable: 'JIRA_API_TOKEN'
          )
        ]) {
          sh """
            node /opt/pr-validator/validate_pr_server.js \
              --owner=${params.PR_OWNER} \
              --repo=${params.PR_REPO} \
              --prNumber=${params.PR_NUMBER}
          """
        }
      }
    }
  }

  post {
    failure {
      echo "PR validation failed—check console logs for details."
    }
  }
}
