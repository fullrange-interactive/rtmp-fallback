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

    this.rtmpdumpProcess = null;
    this.rtmpdumpLogStream = null;

    this._outputStream = null;
    this._piped = false;

  }

  init(){

    return new Promise((resolve, reject) => {

      try{

        this.startFfmpeg();
        // this.startRtmpdump();
        // this.startInnerPipe();

        resolve(this.currentStatus);

      }
      catch(e){

        reject(e);

      }

    })

  }

  onFfmpegExit(errorCode){

    errorCode = errorCode === null ? 0 : errorCode;

    Log.error('warning', 'InputStream', '[InputStream] Input Stream FFMpeg exited with code ' + errorCode);
    
    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg input stream exited with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpeginlog_date`, errorCode);

    this.restart(() => {
      this.pipeTo(this._outputStream, false);
    });

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

        break;


      case RtmpInputStream.status.connectionPending:

        if(Date.now() - this.lastConnection >= this.getValueOrDefault("connectionPendingDuration")){

          this.currentStatus = RtmpInputStream.status.online;
          this.onStatusChange(RtmpInputStream.status.connectionPending);

        }

        break;


      case RtmpInputStream.status.online:

        if(typeof(this.config.onData) !== 'undefined'){
          this.config.onData(frame);
          this.startOutputPipe();
        }

        break;                

      default:
        throw new Error(RtmpInputStream.error.unknownInputStreamStatus(this.currentStatus))

    }    

  }

  pipeTo(outputStream, listenToRestart = true){

    this._outputStream = outputStream;

    if (listenToRestart){
      this._outputStream.on('restart', this.onOutputStreamRestart.bind(this));
    }

  }

  startOutputPipe() {


    if (!this._piped && this._outputStream !== null) {

    // console.log("startoutputpipe ---- " + this.url);

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

    Log.say("[InputStream] output stream restarted. Restarting InputStream with outputStream = " + outputStream.url);
    this.stopOutputPipe();

    this.restart(() => {

      this.pipeTo(outputStream, false);
      this.startOutputPipe();

    });


  }


  onRawData(rawFrame){

    if(this.ffmpegProcess !== null && this.ffmpegProcess.stdin.writable)
      this.ffmpegProcess.stdin.write(rawFrame);

  }

  onConnectionTimeout(){

    if(this.currentStatus === RtmpInputStream.status.offline)
      return;

    Log.error('warning', 'InputStream', '[InputStream] input stream timeout reached.');

    this.restart();

  }

  restart(callback){

    Log.say("[InputStream] restart called.");

    if (this._restarting) {
      Log.say("[InputStream] aborting restart ... a restart is already in process");
      return;
    }

    this._restarting = true;

    this.stop();

    setTimeout(() => {

      this.init()
        .then(() => {

          if (typeof callback !== 'undefined') {
            callback();
          }
          this._restarting = false;

        })
        .catch((e) => {

          throw e;

        })

    }, 2000);    

  }

  onStatusChange(previousStatus){

    if(typeof(this.config.onStatusChange) !== 'undefined')
      this.config.onStatusChange(this.currentStatus, previousStatus)

  }

  stop(){

    Log.say("[InputStream] stop called.");

    if(this.currentStatus !== RtmpInputStream.status.offline){

      let _currentStatus = JSON.parse(JSON.stringify(this.currentStatus));
      this.currentStatus = RtmpInputStream.status.offline;
      this.onStatusChange(_currentStatus);

    }

    this.stopOutputPipe();
    this.stopFfmpeg();

  }

  startFfmpeg(){

    this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpeginlog_${moment().format("DD.MM.YYYY_HH-mm-ss")}`);

    this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-loglevel warning -i ${this.url} -c copy -f mpegts -`).split(' '));
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

    Log.say(`[InputStream] ffmpeg input stream started with pid ${this.ffmpegProcess.pid}`);

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

    Log.say("[InputStream] ffmpeg stopped");

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