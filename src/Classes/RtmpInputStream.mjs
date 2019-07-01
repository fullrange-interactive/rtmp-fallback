import * as ChildProcess from 'child_process';
import fs from 'fs';

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
    //this.rtmpdumpLogStream = null;

  }

  init(){

    return new Promise((resolve, reject) => {

      try{

        this.startFfmpeg();
        this.startRtmpdump();

        resolve(this.currentStatus);

      }
      catch(e){

        reject(e);

      }

    })

  }

  onRtmpdumpExit(errorCode){

    errorCode = errorCode === null ? 0 : errorCode;

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`rtmpdump input stream exited with error code ${errorCode}. More information in log ${Config.logBasePath}/rtmpdumplog`, errorCode);


  }

  onFfmpegExit(errorCode){

    errorCode = errorCode === null ? 0 : errorCode;

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg input stream exited with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpeginlog`, errorCode);

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
        }

        break;                

      default:
        throw new Error(RtmpInputStream.error.unknownInputStreamStatus(this.currentStatus))

    }    

  }

  onRawData(rawFrame){

    if(this.ffmpegProcess !== null && this.ffmpegProcess.stdin.writable)
      this.ffmpegProcess.stdin.write(rawFrame);

  }

  onConnectionTimeout(){

    if(this.currentStatus === RtmpInputStream.status.offline)
      return;

    Log.say("input stream timeout reached.");
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

    this.stopFfmpeg();
    this.stopRtmpdump();

  }

  startFfmpeg(){

    this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpeginlog`);

    this.ffmpegProcess = ChildProcess.spawn('ffmpeg', ('-f live_flv -loglevel panic -i - -c copy -f mpegts -').split(' '));
    this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
    this.ffmpegProcess.stdout.on("data", this.onData.bind(this));
    this.ffmpegProcess.stderr.on("data", (msg) => { if(this.ffmpegLogStream !== null) this.ffmpegLogStream.write(msg) });

    this.ffmpegProcess.on('error', (e) => {
      console.log('something is erroring into the ffmpeg process', e);
    });


    this.ffmpegProcess.on('pipe', (src) => {
      console.log('something is piping into the ffmpeg input process');
    });

    this.ffmpegProcess.on('unpipe', (src) => {
      console.log('something is unpiping into the ffmpeg input process');
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

    this.ffmpegLogStream.end()
    this.ffmpegLogStream = null;    

    Log.say("ffmpeg stopped");

  }

  startRtmpdump(){

    //this.rtmpdumpLogStream = fs.createWriteStream(`${Config.logBasePath}/rtmpdumplog`);

    this.rtmpdumpProcess = ChildProcess.spawn('rtmpdump', (`-m 0 -v -r ${this.url}`).split(' '));    
    this.rtmpdumpProcess.on("exit", this.onRtmpdumpExit.bind(this));
    this.rtmpdumpProcess.stdout.on("data", this.onRawData.bind(this));
    //this.rtmpdumpProcess.stderr.on("data", (msg) => { if(this.rtmpdumpLogStream !== null) this.rtmpdumpLogStream.write(msg) });     

    this.rtmpdumpProcess.on('pipe', (src) => {
      console.log('something is piping into the rtmpdump process');
    });

    this.rtmpdumpProcess.on('error', (e) => {
      console.log('something is erroring into the rtmpdump process', e);
    });

    this.rtmpdumpProcess.on('unpipe', (src) => {
      console.log('something is unpiping into the rtmpdump process');
    });

    Log.say(`rtmpdump input stream started with pid ${this.rtmpdumpProcess.pid}`);

  }

  stopRtmpdump(){

    if(this.rtmpdumpProcess === null)
      return;

    this.rtmpdumpProcess.stdout.unref();
    this.rtmpdumpProcess.stderr.unref();

    this.rtmpdumpProcess.kill('SIGKILL');
    this.rtmpdumpProcess = null;

    //this.rtmpdumpLogStream.end();
    //this.rtmpdumpLogStream = null    

    Log.say("rtmpdump stopped");

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