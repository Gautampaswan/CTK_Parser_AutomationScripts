// CTK Email Parser — Playwright suite
// Agent: Windows (recommended, matches local docs) or Linux (uncomment linux block in Setup stage).
// Secrets: bind Jenkins credentials → env vars listed in docs/JENKINS.md (do not commit .env).

pipeline {
  agent {
    label 'windows' // change to your Jenkins node label, e.g. 'playwright' or 'linux'
  }

  options {
    timeout(time: 6, unit: 'HOURS')
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
  }

  parameters {
    choice(name: 'TEST_SCOPE', choices: ['full', 'from', 'header', 'attachmentfilenames'], description: 'Which tests to run')
    booleanParam(name: 'HEADED', defaultValue: false, description: 'Headed browser (usually false on CI)')
  }

  triggers {
    cron('H 2 * * 1-5') // Weekdays ~02:00 — edit in Jenkins Job → Build Triggers
  }

  // Job → Configure → Environment: SF_LIGHTNING_URL, SF_LOGIN_URL, SF_INSTANCE_URL, CTK_INBOUND_ADDRESS

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Node & Playwright') {
      steps {
        bat '''
          node -v
          npm -v
          call npm ci
          call npx playwright install chromium
        '''
      }
    }

    stage('Salesforce session') {
      steps {
        script {
          // Option A: Secret file credential ID "ctk-storage-state" → auth/storageState.json
          withCredentials([file(credentialsId: 'ctk-storage-state', variable: 'STORAGE_STATE_FILE')]) {
            bat '''
              if not exist auth mkdir auth
              copy /Y "%STORAGE_STATE_FILE%" auth\\storageState.json
            '''
          }
        }
      }
    }

    stage('Run tests') {
      steps {
        withCredentials([
          string(credentialsId: 'ctk-sf-username', variable: 'SF_USERNAME'),
          string(credentialsId: 'ctk-sf-password', variable: 'SF_PASSWORD'),
          string(credentialsId: 'ctk-gmail-user', variable: 'GMAIL_USER'),
          string(credentialsId: 'ctk-gmail-app-password', variable: 'GMAIL_APP_PASSWORD'),
        ]) {
          script {
            def cmd
            if (params.TEST_SCOPE == 'from') cmd = 'call npm run test:from'
            else if (params.TEST_SCOPE == 'header') cmd = 'call npm run test:header'
            else if (params.TEST_SCOPE == 'attachmentfilenames') cmd = 'call npm run test:attachmentfilenames'
            else if (params.HEADED) cmd = 'call npx playwright test --project=chromium --headed'
            else cmd = 'call npm test'
            bat """
              set SF_API_ENABLED=false
              set SMTP_HOST=smtp.gmail.com
              set SMTP_PORT=465
              set POLL_TIMEOUT_MS=240000
              ${cmd}
            """
          }
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'playwright-report/**/*,test-results/**/*,test-results/results.json', allowEmptyArchive: true
    }
    failure {
      echo 'See playwright-report/index.html in build artifacts.'
    }
  }
}
