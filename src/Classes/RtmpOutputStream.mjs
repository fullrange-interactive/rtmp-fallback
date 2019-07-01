import * as ChildProcess from 'child_process';
import fs from 'fs';

import Config from '../Config';

class RtmpOutputStream{

  constructor(url, config){

    this.url = url;
    this.config = config;
    this.currentStatus = RtmpOutputStream.status.offline;

    this.ffmpegProcess = null;
    this.ffmpegLogStream = null;    

  }

  init(){

    return new Promise((resolve, reject) => {

      try{

        this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpegoutlog`);

        this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-fflags +genpts -loglevel panic -re -f mpegts -i - -c copy -acodec libmp3lame -ar 44100 -f flv ${this.url}`).split(" "));
        this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
        this.ffmpegProcess.stderr.on("data", (msg) => { if(this.ffmpegLogStream !== null) this.ffmpegLogStream.write(msg) });

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

        console.log("RtmpOutputStream is now online");

        resolve(this.currentStatus);

      }
      catch(e){

        reject(e);

      }

    })

  }

  restart(){

    this.stop();
    return this.init();

  }

  onFfmpegExit(errorCode){

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg output stream exit with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpeginlog`);

  }

  write(frameData){

    if(this.ffmpegProcess !== null && this.ffmpegProcess.stdin.writable)
      this.ffmpegProcess.stdin.write(frameData);

  }

  getCurrentStatus(){

    return this.getCurrentStatus;

  }

  stop(){

    try{

      console.log("RtmpOutputStream is now offline");

      this.currentStatus = RtmpOutputStream.status.offline;

      this.ffmpegProcess.stdin.pause();
      this.ffmpegProcess.stderr.unref();
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = null;

      this.ffmpegLogStream.end()
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