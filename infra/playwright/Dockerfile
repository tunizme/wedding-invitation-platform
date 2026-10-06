# Browser dependencies for hosts outside Playwright's supported distributions.
# Build context is the installed playwright-core@1.63.0 package (not the repo).
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
COPY --chown=pwuser:pwuser . /opt/playwright-core/
USER pwuser
ENTRYPOINT ["node", "/opt/playwright-core/cli.js"]
CMD ["run-server", "--host", "127.0.0.1", "--port", "39001"]
