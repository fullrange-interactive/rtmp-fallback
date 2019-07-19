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

        this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-fflags +genpts -re -loglevel panic -f mpegts -i - -c copy -acodec libmp3lame -ar 44100 -f flv ${this.url}`).split(" "));
        this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
        this.ffmpegProcess.stderr.on("data", this.onError.bind(this));

        this.ffmpegProcess.stdin.on('error', (e) => {

          this.onError(`Something is erroring in the outputStream ffmpeg stdin stream: ${e}`);

        })

        this.ffmpegProcess.stdout.on('error', (e) => {

          this.onError(`Something is erroring in the outputStream ffmpeg stdout stream: ${e}`);

        })

        this.ffmpegProcess.on('error', (e) => {

          this.onError(`Something is erroring into the ffmpeg outputStream process: ${e}`);

        });

        this.currentStatus = RtmpOutputStream.status.online;

        Log.say("RtmpOutputStream is now online");

        resolve(this.currentStatus);

      }
      catch(e){

        reject(e);

      }

    })

  }

  restart(){

    this.stop();
    var retval = this.init();
    this.emit('restart', this);
    return retval;

  }

  onFfmpegExit(errorCode){

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg output stream exit with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpeginlog`);

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

  getCurrentStatus(){

    return this.getCurrentStatus;

  }

  onError(e){

    if(this.ffmpegLogStream !== null)
      this.ffmpegLogStream.write(e)

    Log.error("critical", "OutputStream", "Catch error", e);

  }

  stop(){

    try{

      Log.error("critical", "OutputStream", "RtmpOutputStream is now offline");

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