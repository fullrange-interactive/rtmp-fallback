import moment from 'moment';

import ProbeLog from './ProbeLog';

import Config from '../Config';

class Log{
  
  static say(value){

    let toSay = `[${moment().format("DD.MM.YYYY - HH:mm:ss")}] ${value}`;

    console.log(toSay);

    try{
      ProbeLog.say(value);  
    }
    catch(e){
      console.error("Can't send probelog", e);
    }
    

  }

  static error(type, caller, message, ...value){

    let toSay = `[${moment().format("DD.MM.YYYY - HH:mm:ss")}] [${type}] ${message}`;

    console.log(toSay, value);

    try{

      ProbeLog.notifyError({
        app: Config.appName,
        type: type,
        caller: caller,
        title: message,
        value: value
      });

    }
    catch(e){

      console.error("Can't send probelog", e);

    }

  }

}

export default Log;