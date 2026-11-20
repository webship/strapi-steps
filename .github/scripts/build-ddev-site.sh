#!/usr/bin/env bash
# Builds the headless CMS site the suite runs against, in a DDEV project: an
# app made with the official installer (create-strapi), the Community Edition,
# on PostgreSQL from DDEV. DDEV has no project type for it, so the project is a
# generic one:
#
#   - Node.js 24 in the web image (baked in, so the server has it before the
#     container's daemons start), the app in app/;
#   - the installer run with its no-cloud option (--skip-cloud): no cloud login,
#     no trial, no licence key; telemetry off (STRAPI_TELEMETRY_DISABLED);
#   - the content model written as schema files (site/strapi-site.mjs schema):
#     an Article collection type (title, slug, rich text, cover image, category,
#     a dynamic zone of three components), a Category collection type, a
#     Homepage single type with a component, Draft and Publish on the articles
#     and the homepage, both localised;
#   - the admin built for production and the server run in production
#     (NODE_ENV=production): the Content-Type Builder only reads there;
#   - the server run by the web container as a daemon, the router sending the
#     project's address to its port (.ddev/config.strapi.yaml);
#   - the accounts, the second locale (French) and the sample content, through
#     the admin's own API.
#
# Settings (environment variables, all optional):
#   PROJECT_NAME      the DDEV project name                     (default strapisteps)
#   SITE_DIR          the project folder                        (default a new temporary folder)
#   STRAPI_VERSION    the release of create-strapi to run       (default latest)
#   ACCOUNT_PASSWORD  the password of the accounts below        (default dD.123123ddd)
#   ACCOUNTS_ONLY     1: build nothing, give the accounts of the site in SITE_DIR
#                     back their password, name, role and active state
#   SEED_ONLY         1: build nothing, put the sample content of the site in
#                     SITE_DIR back as the build made it
#
# The accounts are configuration: this script creates them and cucumber.js names
# them; the features never create or delete one.
#   administrator  administrator@example.com  Super Admin (made with strapi admin:create-user)
#   editor         editor@example.com         Editor: every entry of every content type
#   author         author@example.com         Author: the entries the account made itself
#
# Nothing is installed that the installer does not add: no Enterprise feature,
# no paid service, no account anywhere.
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-strapisteps}"
STRAPI_VERSION="${STRAPI_VERSION:-latest}"
ACCOUNT_PASSWORD="${ACCOUNT_PASSWORD:-dD.123123ddd}"
SITE_DIR="${SITE_DIR:-$(mktemp -d)}"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../site" && pwd)/strapi-site.mjs"
ROOT=/var/www/html
APP="${ROOT}/app"
PORT=1337

# The accounts travel as base64 of a JSON object, so no password is written into
# a file of the project and no quoting can break a value.
accounts_payload() {
  ACCOUNT_PASSWORD="$ACCOUNT_PASSWORD" node -e '
const p = process.env.ACCOUNT_PASSWORD;
const accounts = [
  { handle: "administrator", firstname: "Administrator", lastname: "Webship", email: "administrator@example.com", password: p, role: "strapi-super-admin" },
  { handle: "editor", firstname: "Editor", lastname: "Webship", email: "editor@example.com", password: p, role: "strapi-editor" },
  { handle: "author", firstname: "Author", lastname: "Webship", email: "author@example.com", password: p, role: "strapi-author" },
];
process.stdout.write(Buffer.from(JSON.stringify({ owner: accounts[0], accounts })).toString("base64"));'
}

# strapi-site.mjs with the Node.js of the web container, in the folder of the app.
site_script() {
  ddev exec -d "$APP" "STRAPI_SITE_ACCOUNTS=$(accounts_payload) STRAPI_SITE_URL=http://127.0.0.1:${PORT} node --input-type=module - $*" < "$SCRIPT"
}

wait_for_server() {
  local code=""
  for attempt in $(seq 1 90); do
    code="$(ddev exec "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/_health" < /dev/null 2>/dev/null | tr -d '\r' || true)"
    [ "$code" = "204" ] && return 0
    sleep 2
  done
  echo "The server did not answer (last status: ${code:-none}); the end of its log:" >&2
  ddev exec "supervisorctl tail -8000 webextradaemons:strapi stderr; supervisorctl tail -8000 webextradaemons:strapi" < /dev/null >&2 || true
  return 1
}

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

if [ "${ACCOUNTS_ONLY:-}" = "1" ]; then
  site_script accounts add
  exit 0
fi
if [ "${SEED_ONLY:-}" = "1" ]; then
  site_script seed
  exit 0
fi

# A generic project: no web server of DDEV's own, the database PostgreSQL 17,
# Node.js 24 (baked into the image below as well).
ddev config --project-type=generic --webserver-type=generic --docroot="" --project-name="$PROJECT_NAME" \
  --database=postgres:17 --nodejs-version=24

mkdir -p .ddev/web-build
cat > .ddev/config.strapi.yaml <<YAMLEOF
# The headless CMS of this project. The web container serves no files of its
# own: the router sends ports 80 and 443 of the project's address to the app's
# server, which the web container runs as a daemon, in production, once the
# build has finished.
web_extra_exposed_ports:
  - name: strapi
    container_port: ${PORT}
    http_port: 80
    https_port: 443
web_extra_daemons:
  - name: strapi
    command: "bash -c 'while [ ! -f ${APP}/.ready ]; do sleep 2; done; cd ${APP} && export NODE_ENV=production && exec ./node_modules/.bin/strapi start'"
    directory: ${ROOT}
web_environment:
  - STRAPI_TELEMETRY_DISABLED=true
YAMLEOF
cat > .ddev/web-build/Dockerfile.strapi <<'DOCKEREOF'
# Node.js 24 in the web image, so the app's server has it before the
# container's daemons start, on every restart and offline.
RUN N_PREFIX=/usr/local n install 24 && node --version
DOCKEREOF

ddev start -y

# The app, with the official installer: TypeScript (its default), npm, no
# example data, no git repository, PostgreSQL of DDEV (db / db / db), and no
# cloud login (--skip-cloud).
ddev exec "rm -rf ${APP} && cd ${ROOT} && npx -y create-strapi@${STRAPI_VERSION} app --no-run --skip-cloud --non-interactive --typescript --use-npm --install --no-example --no-git-init --dbclient=postgres --dbhost=db --dbport=5432 --dbname=db --dbusername=db --dbpassword=db" < /dev/null

# The settings of the container and the content model, then the production build.
site_script config "https://${PROJECT_NAME}.ddev.site"
site_script schema
ddev exec -d "$APP" "NODE_ENV=production npm run build" < /dev/null

# The server starts once the app is built.
ddev exec "touch ${APP}/.ready" < /dev/null
ddev exec "supervisorctl restart webextradaemons:strapi" < /dev/null
wait_for_server

# The Super Admin with the installer's CLI, then the other accounts through the
# admin's API, the second locale, and the sample content.
ddev exec -d "$APP" "NODE_ENV=production ./node_modules/.bin/strapi admin:create-user --firstname=Administrator --lastname=Webship --email=administrator@example.com --password='${ACCOUNT_PASSWORD}'" < /dev/null
site_script accounts add locales seed

SITE_URL="$(ddev describe -j | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).raw.primary_url))")"
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=$SITE_URL" >> "$GITHUB_ENV"
fi
VERSION="$(ddev exec "node -p \"require('${APP}/node_modules/@strapi/strapi/package.json').version\"" < /dev/null | tr -d '\r')"
echo "Built the Strapi ${VERSION} site at $SITE_URL (admin: $SITE_URL/admin)"
