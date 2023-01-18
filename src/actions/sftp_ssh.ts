import * as Hub from "looker-action-hub/lib/hub"
import {promises as fs} from 'fs'
import * as Path from "path"
import * as Client from "ssh2-sftp-client"
import * as openpgp from 'openpgp'
import * as moment from 'moment'
import { URL } from "url"
import { Readable } from 'stream'

export class SFTPActionKey extends Hub.Action {

  name = "sftp_sshkey"
  label = "SFTP SSHKEY"
  iconName = "sftp/sftp.png"
  description = "Send data files to an SFTP server with a Key."
  supportedActionTypes = [Hub.ActionType.Query]
  supportedDownloadSettings= ['csv']
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
      let transformedStream = Readable.from(transformed)
      let output = new Readable
      let valid_request = true
      if (request.formParams.encrypt==="yes"){
        if(request.formParams.pgp_key){
          const test_pgp=request.formParams.pgp_key
          try{
          output=await this.pgpEncrypt(transformedStream, test_pgp)
          } catch (e){
            let errorMessage=""
            if (typeof e === "string") {
              errorMessage=e
              } else if (e instanceof Error) {
                errorMessage=e.message
              }
            output.push(null)
            resolve(new Hub.ActionResponse({success: false, message:errorMessage}))
            valid_request=false
          }
        }
        else {
          resolve(new Hub.ActionResponse({ success:false, message:"PGP Key not provided"}))
          valid_request=false
        }
      }
      let remotePath=""
      if (request.formParams.prefixfile) {
        let prefix=""
        const today = new Date()
        try {
          prefix = moment(today).format(request.formParams.prefixfile)
        } catch{
          console.warn('Unusuable Date Format Submitted')
          resolve(new Hub.ActionResponse({success: false, message:"Unusuable Date Format Submitted"}))
        }
        remotePath = Path.join(parsedUrl.pathname, prefix+"_"+fileName, valid_request? ".pgp" :"")
      }
      else{
        remotePath = Path.join(parsedUrl.pathname, fileName)
      }

      try {
        if (valid_request){
        await sftp.connect(conf)
        const response = await sftp.put(request.formParams.encrypt==="yes"? output : transformedStream, remotePath)
        console.info(response)
        resolve(new Hub.ActionResponse({}))}
      } catch (e) {
        let errorMessage=""
        if (typeof e === "string") {
          errorMessage=e
          } else if (e instanceof Error) {
            errorMessage=e.message
          }
        console.error(e)  
        resolve(new Hub.ActionResponse({success: false, message:errorMessage}))
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
      options: [
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
        label: "SSH Key",
        name: "key",
        type: "textarea",
      },
      {
        label: "SSH Key Passphrase",
        name: "passphrase",
        type: "string",
        default: "test"
      },
      {
        label: "File Encryption",
        name: "encrypt",
        type: "select",
        options: [
          {
            name: "yes",
            label: "Yes"
          },
          {
            name: "no",
            label: "No"
          }
        ]
      },
      {
        label: "PGP Public Key",
        name: "pgp_key",
        type: "textarea"
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
      sshKey = await fs.readFile(Path.resolve('./id_ed25519'),'utf-8')
      } catch (e){
        throw e
      }
    }
    if (!parsedUrl.hostname) {
      throw "Needs a valid SFTP address."
    }
    const config = {
      host: parsedUrl.hostname,
      username: request.formParams.username,
      privateKey: sshKey,
      passphrase: request.formParams.passphrase,
      port: +(parsedUrl.port ? parsedUrl.port : 22)
    }

    return config
  }

  private async pgpEncrypt(fileStr: openpgp.NodeStream<any>, encryptionKey:string) {
  try{
  const publicKey = await openpgp.readKey({ armoredKey: encryptionKey });
  const encrypted : openpgp.NodeStream<string>= await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: fileStr}), // input as Message object
    encryptionKeys: publicKey
  })
  return encrypted as Readable}
  catch(e){
    throw e
  }
  }

  }

Hub.addAction(new SFTPActionKey())
