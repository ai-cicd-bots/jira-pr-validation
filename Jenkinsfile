pipeline {
  agent any

  // Use your pre-installed Node.js; if you need a specific version, install via NodeJS plugin
  environment {
    GITHUB_TOKEN    = credentials('github-token')
    MISTRAL_API_KEY = credentials('mistral-api-key')
    JIRA_HOST       = 'yourcompany.atlassian.net'
  }

  stages {
    stage('Checkout & Setup') {
      steps {
        checkout scm
        sh 'npm ci'
      }
    }

    stage('Validate PR Against JIRA') {
      when { expression { env.CHANGE_ID != null } }  // only for PR builds
      steps {
        withCredentials([usernamePassword(credentialsId: 'jira-creds', 
                                          usernameVariable: 'JIRA_USER_EMAIL', 
                                          passwordVariable: 'JIRA_API_TOKEN')]) {
          sh 'node .github/scripts/validate_pr_jenkins.js'
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: '**/logs/**/*.log', allowEmptyArchive: true
    }
  }
}
