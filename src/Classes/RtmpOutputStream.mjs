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

        this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-fflags +genpts -re -f mpegts -i - -c copy -acodec libmp3lame -ar 44100 -f flv ${this.url}`).split(" "));
        this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
        this.ffmpegProcess.stderr.on("data", (msg) => this.ffmpegLogStream.write(msg));

        this.currentStatus = RtmpOutputStream.status.online;

        resolve(this.currentStatus);

      }
      catch(e){

        reject(e);

      }

    })

  }

  onFfmpegExit(errorCode){

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg exit with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpeginlog`);

  }

  write(frameData){

    if(this.currentStatus === RtmpOutputStream.status.offline)
      throw new Error(RtmpOutputStream.error.streamIsOffline)

    this.ffmpegProcess.stdin.write(frameData);

  }

  getCurrentStatus(){

    return this.getCurrentStatus;

  }

  stop(){

    this.currentStatus = RtmpOutputStream.status.offline;

    this.ffmpegProcess.stdin.pause();
    this.ffmpegProcess.stderr.unref();
    this.ffmpegProcess.kill('SIGKILL');
    this.ffmpegProcess = null;

    this.ffmpegLogStream.end()
    this.ffmpegLogStream = null;

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