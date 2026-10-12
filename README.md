# Morphiume

The repository currently contains the server deployment foundation. Application code and its container image will be added in a subsequent task.

The deployment server is `192.168.240.51`, with Docker Compose and Nginx configured for private-IP access.

- Infrastructure health: [http://192.168.240.51/healthz](http://192.168.240.51/healthz)
- SSH from the configured computer: `ssh morphiume-deploy`
- Deployment instructions and verified server state: [DEPLOYMENT.md](DEPLOYMENT.md)
- Repeatable server setup: [deploy/provision.sh](deploy/provision.sh)
- Application container template: [deploy/compose.yaml](deploy/compose.yaml)

The web root returns HTTP 503 until an application is deployed. The health endpoint checks the prepared server infrastructure.

Completed repository changes are committed and pushed directly to GitHub `main`, as requested by the owner.
