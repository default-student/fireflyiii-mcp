# Install on a private server and connect over SSH

This setup keeps the Firefly III token on a server you control. The MCP client starts the server process over SSH whenever it connects, so you do not need to expose an HTTP port. The client machine needs SSH access to that server, and the server needs network access to Firefly III.

Use the repository for this privacy-filtered fork when installing it. The filter runs on the server before tool results reach the client. It hides monetary output and image attachments, but it does not filter tool inputs, server logs, direct shell access, or Firefly III itself. See [Monetary output privacy](./#monetary-output-privacy) for details.

## 1. Install the server

On the server, install Node.js 22.12 or later, Git, and npm. Clone this fork and build it:

```bash
git clone https://github.com/default-student/fireflyiii-mcp.git
cd fireflyiii-mcp
npm ci
npm run build
```

Create a `.env` file in the checkout with the URL and a Firefly III Personal Access Token. Create the token in Firefly III under **Options → Remote access and tokens → Create new token**.

```dotenv
FIREFLY_URL=https://your-firefly-instance.example.com
FIREFLY_TOKEN=your-personal-access-token
MCP_READ_ONLY=true
```

Protect the file so only the account that runs the MCP process can read it:

```bash
chmod 600 .env
```

The example enables read-only tools. Remove `MCP_READ_ONLY` only if you intend to allow write tools. Keep the checkout and `.env` on a persistent disk, and do not commit `.env`.

## 2. Make a remote launcher

Create `~/.local/bin/fireflyiii-mcp` for a server account that can log in and run remote commands over SSH. Set the paths below to the checkout and Node.js executable on your server:

```sh
#!/bin/sh
cd /path/to/fireflyiii-mcp || exit 1
exec /usr/bin/node /path/to/fireflyiii-mcp/node_modules/dotenv-cli/cli.js \
  -e /path/to/fireflyiii-mcp/.env -- \
  /usr/bin/node /path/to/fireflyiii-mcp/dist/index.js
```

Replace both example paths with the absolute checkout path, then make the launcher executable:

```bash
chmod 700 ~/.local/bin/fireflyiii-mcp
```

The account needs read access to the checkout and `.env`. Configure SSH key access for that account. Test that the launcher starts over SSH and exits cleanly when the SSH session closes. MCP stdio uses the SSH connection for protocol traffic, so the launcher must not print status messages to standard output.

## 3. Connect an MCP client

In Codex CLI, add the server on the client machine with:

```bash
codex mcp add firefly_privacy -- ssh mcp-user@server.example.com /home/mcp-user/.local/bin/fireflyiii-mcp
codex mcp list
```

Replace the SSH destination and launcher path with your values. Reconnect the Codex session so it starts the server over SSH.

Other clients using the `mcpServers` JSON format can use this configuration:

```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "ssh",
      "args": ["mcp-user@server.example.com", "/home/mcp-user/.local/bin/fireflyiii-mcp"]
    }
  }
}
```

The MCP client and SSH key stay on the client device. The Firefly III URL and token stay in the server's `.env`; do not put the token in the client configuration. If the client requires an explicit host key prompt, connect once with SSH interactively and verify the server identity before accepting it.

Other MCP clients can use the same stdio arrangement if they can launch a command with arguments: `ssh`, the server account and host, then the absolute launcher path. Check that client's documentation for its configuration format.

After reconnecting, confirm that the client lists the Firefly III tools. For a safe connectivity check, call `get_about`, which returns Firefly III instance metadata and does not read transaction or balance data. Avoid testing with a report, account, budget, or transaction tool if you do not want financial data returned to the client.

## 4. Update the server

From the checkout on the server, fetch the desired fork revision, install dependencies, and rebuild:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm run build
```

Pin a reviewed commit instead of following `main` if you need predictable updates. Restart the MCP client connection after an update so SSH starts the rebuilt server. Keep a backup of the checkout and its configuration before changing versions.
