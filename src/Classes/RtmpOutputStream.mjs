import * as ChildProcess from 'child_process';
import fs from 'fs';
import moment from 'moment';
import EventEmitter from 'events';

import Log from './Log';

import Config from '../Config';

class RtmpOutputStream extends EventEmitter{

  constructor(url, config){

    super();

    this.url = url;
    this.config = config;
    this.currentStatus = RtmpOutputStream.status.offline;

    this.ffmpegProcess = null;
    this.ffmpegLogStream = null;

  }

  init(){

    return new Promise((resolve, reject) => {

      try{

        this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpegoutlog_${moment().format("DD.MM.YYYY_HH:mm:ss")}`);

        this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-loglevel warning -fflags +genpts -re -f mpegts -i - -c copy -acodec libmp3lame -ar 44100 -f flv ${this.url}`).split(" "));
        this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
        this.ffmpegProcess.stderr.on("data", (msg) => { if(this.ffmpegLogStream !== null) this.ffmpegLogStream.write(msg) });

        this.ffmpegProcess.stdin.on('error', (e) => {
          console.log('something is erroring in the outputStream ffmpeg stdin stream', e);
        })

        this.ffmpegProcess.stdout.on('error', (e) => {
          console.log('something is erroring in the outputStream ffmpeg stdout stream', e);
        })

        this.ffmpegProcess.on('error', (e) => {
          console.log('something is erroring into the ffmpeg process', e);
        });

        this.ffmpegProcess.on('pipe', (src) => {
          console.log('something is piping into the ffmpeg output process');
        });

        this.ffmpegProcess.on('unpipe', (src) => {
          console.log('something is unpiping into the ffmpeg output process');
        });

        this.currentStatus = RtmpOutputStream.status.online;

        Log.say(`[RtmpOutputStream] ffmpeg output stream started with pid ${this.ffmpegProcess.pid}`);

        resolve(this.currentStatus);

      }
      catch(e){

        reject(e);

      }

    })

  }

  restart(){

    this.stop();
    setTimeout(() => {

      this.init()
        .then(() => {
          this.emit('restart', this);
        })
        .catch((e) => {
          throw e;
        });
      
    }, 10000);

  }

  onFfmpegExit(errorCode){

    errorCode = errorCode === null ? 0 : errorCode;

    // console.log("Rtmp")
    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg output stream exit with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpeginlog`);

    Log.error('warning', 'OutputStream', '[OutputStream] FFMpeg exited with code ' + errorCode);

    this.restart();

  }

  pipeFrom(inputStream){

    if (this.ffmpegProcess !== null){
      inputStream.pipe(this.ffmpegProcess.stdin, { end: false });
    }

  }

  unpipeFrom(inputStream){

    if (this.ffmpegProcess !== null){
      inputStream.unpipe(this.ffmpegProcess.stdin);
    }

  }

  write(frameData){

    // if(this.ffmpegProcess !== null && this.ffmpegProcess.stdin.writable)
    //   this.ffmpegProcess.stdin.write(frameData);

  }

  getCurrentStatus(){

    return this.getCurrentStatus;

  }

  stop(){

    try{

      Log.say("[RtmpOutputStream] is now offline");

      this.currentStatus = RtmpOutputStream.status.offline;

      this.ffmpegProcess.stdin.pause();
      this.ffmpegProcess.stderr.unref();
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = null;

      if (this.ffmpegLogStream !== null){
        this.ffmpegLogStream.end()
      }
      this.ffmpegLogStream = null;

    }
    catch(e){

    }

  }

  static get status(){

    return {
      offline: 'offline',
      online: 'online'
    };

  }

  static get error(){

    return {

      streamIsOffline: 'Output stream is currently offline'

    }

  }

}

export default RtmpOutputStream;