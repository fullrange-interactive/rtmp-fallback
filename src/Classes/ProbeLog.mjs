import Axios from 'axios';

import Config from '../Config';

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

class ProbeLog{

  static notifyError(error){

    error.app = Config.appName;
    error.value = JSON.stringify(error.value);

    ProbeLog.createProbeLog(error);

  }

  static say(text, ...value){

    ProbeLog.createProbeLog({
      app: Config.appName,
      type: 'info',
      caller: 'say',
      title: text,
      value: JSON.stringify(value)
    });

  }

  static get headers(){

    let headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-access-secret': Config.probeLogSecret
    }

    return {
      headers: headers
    };    

  }

  static createProbeLog(error){

    Axios.post(Config.probeLogApiUrl + '/probelogs', error, ProbeLog.headers)
      .catch((error) => {

        console.log("Info: Can't send to probelog.");

      });  

  }

}

export default ProbeLog;