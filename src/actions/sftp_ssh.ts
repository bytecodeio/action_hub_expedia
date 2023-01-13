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

      if (request.formParams.encrypt==="yes"){
        if(request.formParams.pgp_key){
          const test_pgp=`-----BEGIN PGP PUBLIC KEY BLOCK-----

xjMEY8Fn0hYJKwYBBAHaRw8BAQdAuJRHEsc3/G+5tCRQg0zO8K0n3tUjAB2R
sM9OYQVgqWXNHFRlc3QgVXNlciA8dGVzdEBleGFtcGxlLmNvbT7CjAQQFgoA
PgUCY8Fn0gQLCQcICRBVemOneBFEwwMVCAoEFgACAQIZAQIbAwIeARYhBAan
WevHvAOGhnEgn1V6Y6d4EUTDAABuowD/SbVA+sehktiBRM2tlM1fP4FJo4d6
cpEKYj76S0+QqdcA/01loxMA/8XkRsZ5Wc0/KkGzQ1YkNF7ucrMxPvRNRf4G
zjgEY8Fn0hIKKwYBBAGXVQEFAQEHQLzI/krK80hq2YVOWwTWDan7u1YllCNF
GFHe8sR0ScU5AwEIB8J4BBgWCAAqBQJjwWfSCRBVemOneBFEwwIbDBYhBAan
WevHvAOGhnEgn1V6Y6d4EUTDAACLQgEAjhGpdRpe3VP2jpLPvsVua/KPzgW0
dEYVfRVMxwdbkM8BAJLBQKOV4lJVpzCanCndMDqjtYKyZWajfX9RQORnFpcK
=gx/k
-----END PGP PUBLIC KEY BLOCK-----`
          output=await this.pgpEncrypt(transformedStream, test_pgp)
          console.log(output)
        }
      }

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
        const response = await sftp.put(request.formParams.encrypt==="yes"? output :transformedStream, remotePath)
        console.info(response)
        resolve(new Hub.ActionResponse({}))
      } catch (e) {
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
      console.log('Form Key',sshKey)
    }
    else {
      try {
      sshKey = await fs.readFile(Path.resolve('./id_ed25519'),'utf-8')
      } catch (e){
        throw e
      }
    }

    console.log(sshKey)

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
  const publicKey = await openpgp.readKey({ armoredKey: encryptionKey });
  const encrypted : openpgp.NodeStream<string>= await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: fileStr}), // input as Message object
    encryptionKeys: publicKey
  })

  return encrypted as Readable
  }

  }

Hub.addAction(new SFTPActionKey())
