import "./actions/action"
import "./actions/sftp"
import "./actions/sftp_ssh"
import Server from "looker-action-hub/lib/server/server"

require('dotenv').config()

Server.run()
