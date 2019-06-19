import moment from 'moment';

class Log{
  
  static say(value){

    let toSay = `[${moment().format("DD.MM.YYYY - HH:mm:ss")}] ${value}`;

    console.log(toSay);

  }

}

export default Log;