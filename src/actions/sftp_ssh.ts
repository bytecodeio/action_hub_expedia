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

      const conf=await this.sftpConfig(request)

      let sftp = new Client()

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

      try {
        await sftp.connect(conf)
        let d = await sftp.list('/')
        console.log(d)
        console.log(transformed)
        console.log(remotePath)
        const response = await sftp.put(transformed, remotePath)
        console.log(response)
        resolve(new Hub.ActionResponse({}))
        console.log('HAPPENED')
      } catch (e) {
        console.log('-------FAILED----------')
        resolve(new Hub.ActionResponse({success: false}))
        console.error(e)
      } finally {
        await sftp.end();
      }
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
    },
    {
      name: "passphrase",
      type: "string"
    }
  ]
    return form
  }

  private async sftpConfig(request: Hub.ActionRequest) {

    const parsedUrl = new URL(request.formParams.address!)
    let sshKey=""
    if (request.formParams.key){
      sshKey=request.formParams.key
    }
    else {
      try {
      sshKey = await fs.readFile(Path.resolve('./keys/id_ed25519'),'utf-8')
      } catch (e){
        throw e
      }
    }

    if (!parsedUrl.hostname) {
      throw "Needs a valid SFTP address."
    }
//host: parsedUrl.hostname,
    const config = {
      host: parsedUrl.hostname,
      username: request.formParams.username,
      privateKey: sshKey,
      passphrase: 'test',
      port: +(parsedUrl.port ? parsedUrl.port : 22)
    }

    return config
  }
  }

Hub.addAction(new SFTPActionKey())
