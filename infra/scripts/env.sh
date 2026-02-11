#!/usr/bin/env bash

REPO_NAME=${REPO_NAME:-chult-map-service}
IMAGE_TAG=${IMAGE_TAG:-}
AWS_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}
ROLE_NAME=${ROLE_NAME:-ChultLambdaExecutionRole}
STATIC_BUCKET_NAME=${STATIC_BUCKET_NAME:-oolong-chult-map-service}
