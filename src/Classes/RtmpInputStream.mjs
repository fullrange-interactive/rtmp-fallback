import * as ChildProcess from 'child_process';
import fs from 'fs';
import moment from 'moment';

import Log from './Log';

import Config from '../Config';

class RtmpInputStream{

  /**
  * available configs:
  *
  * connectionTimeout - in ms
  * connectionPendingDuration - in ms
  *
  * onExit(error)
  * onData(frame)
  * onStatusChange(currentStatus, previousStatus)
  *
  **/

  constructor(url, config){

    this.url = url;
    this.config = config;
    this.currentStatus = RtmpInputStream.status.offline;
    this.lastConnection = null; //Date

    this._connectionTimeout = null;

    this.ffmpegProcess = null;
    this.ffmpegLogStream = null;

    this._outputStream = null;
    this._piped = false;

  }

  init(){

    return new Promise((resolve, reject) => {

      try{

        this.startFfmpeg();

        resolve(this.currentStatus);

      }
      catch(e){

        reject(e);

      }

    })

  }

  startFfmpeg(){

    // this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpeginlog_${moment().format("DD.MM.YYYY_HH-mm-ss")}`);

    this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-i ${this.url} -c copy -f mpegts -`).split(' '));
    this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
    this.ffmpegProcess.stdout.on("data", this.onData.bind(this));
    this.ffmpegProcess.stderr.on("data", (msg) => { if(this.ffmpegLogStream !== null) this.ffmpegLogStream.write(msg) });

    this.ffmpegProcess.stdin.on('error', (e) => {
      console.log('something is erroring in the inputstream ffmpeg stdin stream', e);
    })

    this.ffmpegProcess.stdout.on('error', (e) => {
      console.log('something is erroring in the inputstream ffmpeg stdout stream', e);
    })

    this.ffmpegProcess.on('error', (e) => {
      console.log('something is erroring into the ffmpeg process', e);
    });

    Log.say(`ffmpeg input stream started with pid ${this.ffmpegProcess.pid}`);

  }  

  stopFfmpeg(){

    if(this.ffmpegProcess === null)
      return;

    this.ffmpegProcess.stdin.pause();
    this.ffmpegProcess.stdout.unref();
    this.ffmpegProcess.stderr.unref();
    this.ffmpegProcess.kill('SIGKILL');
    this.ffmpegProcess = null;

    if (this.ffmpegLogStream !== null){
      this.ffmpegLogStream.end()
    }
    this.ffmpegLogStream = null;    

    Log.say("InputStream ffmpeg stopped");

  }

  onFfmpegExit(errorCode){

    errorCode = errorCode === null ? 0 : errorCode;

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg input stream exited with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpeginlog_date`, errorCode);

  }

  onData(frame){

    if(this._connectionTimeout)
      clearTimeout(this._connectionTimeout);

    this._connectionTimeout = setTimeout(this.onConnectionTimeout.bind(this), this.getValueOrDefault("connectionTimeout"));  

    switch(this.currentStatus){

      case RtmpInputStream.status.offline:

        this.currentStatus = RtmpInputStream.status.connectionPending;
        this.lastConnection = new Date();
        this.onStatusChange(RtmpInputStream.status.offline);

        this.stopOutputPipe();

        break;


      case RtmpInputStream.status.connectionPending:

        if(Date.now() - this.lastConnection >= this.getValueOrDefault("connectionPendingDuration")){

          this.currentStatus = RtmpInputStream.status.online;
          this.onStatusChange(RtmpInputStream.status.connectionPending);

          this.stopOutputPipe();

        }

        break;


      case RtmpInputStream.status.online:

        if(typeof(this.config.onData) !== 'undefined')
          this.config.onData(frame);

        this.startOutputPipe();

        break;                

      default:
        throw new Error(RtmpInputStream.error.unknownInputStreamStatus(this.currentStatus))

    }    

  }

  pipeTo(outputStream, listenToRestart = true){

    this._outputStream = outputStream;

    if (listenToRestart)
      this._outputStream.on('restart', this.onOutputStreamRestart.bind(this));

  }

  startOutputPipe() {

    if (!this._piped && this._outputStream !== null) {

      this._outputStream.pipeFrom(this.ffmpegProcess.stdout);
      this._piped = true;

    }

  }

  stopOutputPipe() {

    if (this._piped && this._outputStream !== null) {

      this._outputStream.unpipeFrom(this.ffmpegProcess.stdout);
      this._piped = false;

    }

  }

  onOutputStreamRestart(outputStream){

    Log.say("Outputstream restarted...");
    this.pipeTo(outputStream, false);
    this.stopOutputPipe();
    this.startOutputPipe();

  }

  onConnectionTimeout(){

    if(this.currentStatus === RtmpInputStream.status.offline)
      return;

    Log.say(`input stream timeout reached.`);
    this.restart();

  }

  restart(){

    Log.say("Input stream restart called.");

    this.stop();
    setTimeout(() => {

      this.init()
        .catch((e) => {

          throw new Error(e);

        })

    }, 2000);    

  }

  onStatusChange(previousStatus){

    if(typeof(this.config.onStatusChange) !== 'undefined')
      this.config.onStatusChange(this.currentStatus, previousStatus)

  }

  stop(){

    Log.say("stop called.");

    if(this.currentStatus !== RtmpInputStream.status.offline){

      let _currentStatus = JSON.parse(JSON.stringify(this.currentStatus));
      this.currentStatus = RtmpInputStream.status.offline;
      this.onStatusChange(_currentStatus);

    }

    this.stopOutputPipe();
    this.stopFfmpeg();

  }

  getValueOrDefault(name){

    return typeof(this.config[name]) === 'undefined' ? RtmpInputStream.default[name] : this.config[name];    

  }

  static get default(){

    return {
      connectionPendingDuration: Config.defaultConnectionPendingDuration,
      connectionTimeout: Config.defaultConnectionTimeout
    }

  }

  static get status(){

    return {
      offline: 'offline',
      connectionPending: 'connectionPending',
      online: 'online'
    };

  }

  static get error(){

    return {

      unknownInputStreamStatus: (status) => {
        return `Unknown status ${status}.`;
      }

    }

  }

}

export default RtmpInputStream;