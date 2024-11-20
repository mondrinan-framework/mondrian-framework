FROM public.ecr.aws/lambda/nodejs:22-arm64

RUN npm i -g rimraf
COPY ./package.json ${LAMBDA_TASK_ROOT}
COPY ./package-lock.json ${LAMBDA_TASK_ROOT}
COPY ./tsconfig.json ${LAMBDA_TASK_ROOT}
COPY ./packages ${LAMBDA_TASK_ROOT}/packages
RUN npx rimraf packages/*/build/** && npx rimraf packages/*/.build/** && npx rimraf packages/*/tsconfig.tsbuildinfo && npx rimraf packages/*/node_modules/** && npx rimraf packages/*/coverage/**
RUN npm ci && npm run build
RUN npx rimraf packages/*/src/**

CMD ["packages/ci-tools/build/handler.handler"]
