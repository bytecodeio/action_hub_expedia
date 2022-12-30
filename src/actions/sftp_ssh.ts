import * as Hub from "looker-action-hub/lib/hub"
import {promises as fs} from 'fs'
import * as Path from "path"
import * as Client from "ssh2-sftp-client"
import * as moment from 'moment'
import { URL } from "url"


export class SFTPActionKey extends Hub.Action {

  name = "sftp_sshkey"
  label = "SFTP SSHKEY"
  iconName = "sftp/sftp.png"
  description = "Send data files to an SFTP server with a Key."
  supportedActionTypes = [Hub.ActionType.Query]
  params = []

  async execute(request: Hub.ActionRequest) {
    return new Promise<Hub.ActionResponse>(async (resolve, reject) => {

      if (!request.attachment || !request.attachment.dataBuffer) {
        reject("Couldn't get data from attachment.")
        return
      }

      if (!request.formParams.address) {
        reject("Needs a valid SFTP address.")
        return
      }

      let client: any

      try {
        client = await this.sftpClientFromRequest(request)
      } catch (e) {
        console.error(e)
      }
      const parsedUrl = new URL(request.formParams.address)
      if (!parsedUrl.pathname) {
        throw "Needs a valid SFTP address."
      }
      const data = request.attachment.dataBuffer
      const fileName = request.formParams.filename || request.suggestedFilename()
    
      const transformed = data.slice(data.indexOf('\n')+1)

      let remotePath=""
      if (request.formParams.prefixfile) {
        let prefix=""
        const today = new Date()
        try {
          prefix = moment(today).format(request.formParams.prefixfile)
        } catch{
          console.warn('Unusuable Format Submitted')
        }

        remotePath = Path.join(parsedUrl.pathname, prefix+"_"+fileName)
      }
      else{
        remotePath = Path.join(parsedUrl.pathname, fileName)
      }
      const filestat=await client.put(transformed, remotePath)
        .then(() => resolve(new Hub.ActionResponse()))
        .catch((err: any) => resolve(new Hub.ActionResponse({success: false, message: err.message})))
      
      console.info(filestat)
    })
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      name: "address",
      label: "Address",
      description: "e.g. sftp://host/path/",
      type: "string",
      required: true,
    }, {
      name: "username",
      label: "Username",
      type: "string",
      required: true,
    }, {
      label: "Filename",
      name: "filename",
      type: "string",
    },{
      label: "PrefixFile",
      name: "prefixfile",
      type: "select",
      options: [{
        name: "none",
        label: "None"
      },
      {
        name: "yymm",
        label: "YY-MM"
      },
      {
        name: 'yyyymmdd',
        label: "YYYY-MM-DD"
      }]
    },
    {
      name: "key",
      type: "string"
    }
  ]
    return form
  }

  private async sftpClientFromRequest(request: Hub.ActionRequest) {

    console.log(request)

    const client = new Client()
    const parsedUrl = new URL(request.formParams.address!)
/* Example of raw string used 
    let sshKey= `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABAgAxTcXo
d8nOL+8McMbQMhAAAAEAAAAAEAAAIXAAAAB3NzaC1yc2EAAAADAQABAAACAQCasp5Yg+o5
kBkFJ1bsJJ4vINFcrHfI9VEg+UGxo+I+wLLPLnSykxJLbDQ0Q0SsK5joRGi6n2vBwuR/ho
REST OF KEY
-----END OPENSSH PRIVATE KEY-----`
*/
    let sshKey=""
    if (request.formParams.key){
      sshKey=request.formParams.key
    }
    else {
      try {
      sshKey = await fs.readFile(Path.resolve('./keys/test_sftp'),'utf-8')
      } catch (e){
        throw e
      }
    }
    console.log("KEY1",sshKey)

    if (!parsedUrl.hostname) {
      throw "Needs a valid SFTP address."
    }
    try {
      await client.connect({
        host: parsedUrl.hostname,
        username: request.formParams.username,
        privateKey: sshKey,
        passphrase: 'hello',
        port: +(parsedUrl.port ? parsedUrl.port : 22),
      })
    } catch (e) {
      throw e
    }
    return client
  }

}

Hub.addAction(new SFTPActionKey())