import fs from 'fs';
import getDuration from 'get-video-duration';

class FallbackVideoPlayer{

  constructor(filePath, config){

    this.filePath = filePath;
    this.config = config;
    this.isReady = false;

    this.buffer = null;
    this.bufferlen = 0;

    this.lastPlay = null;
    this._sendData = null;

  }

  init(){

    return new Promise((resolve, reject) => {

      this.buffer = fs.readFileSync(this.filePath);

      getDuration(this.filePath)
        .then((duration) => {

          this.bufferlen = duration * 1000;
          this.isReady = true;
          resolve(this.bufferlen);

        })
        .catch(reject);

    })

  }

  start(){

    if(!this.isReady || this._sendData)      
      return;

    console.log("FallbackVideo started.");

    if(typeof(this.config.onData) !== 'undefined')
      this.config.onData(this.buffer);

    this.sendData();

  }

  stop(){

    if(this._sendData){

      console.log("FallbackVideo stopped.");

      clearTimeout(this._sendData);

      this.lastPlay = null;
      this._sendData = null;

    }

  }

  sendData(){

    let timeout = this.lastPlay === null ?
      this.bufferlen :
      Date.now() - this.lastPlay + this.bufferlen;

    this._sendData = setTimeout(() => {

      if(typeof(this.config.onData) !== 'undefined')
        this.config.onData(this.buffer);
      
      this.lastPlay = Date.now();
      this.sendData();

    }, timeout);

  }

}

export default FallbackVideoPlayer;