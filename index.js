const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();

app.get('/screenshot', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send("Missing 'url' query param");

  try {
    const tempVideoPath = path.join(os.tmpdir(), `video-${Date.now()}.mp4`);
    const tempImagePath = path.join(os.tmpdir(), `screenshot-${Date.now()}.png`);

    // ভিডিও ডাউনলোড
    const response = await axios({
      url: videoUrl,
      responseType: 'stream',
      timeout: 10000,
    });

    const writer = fs.createWriteStream(tempVideoPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // ffmpeg দিয়ে মাঝখানের ফ্রেম থেকে স্ক্রিনশট নেওয়া
    ffmpeg.ffprobe(tempVideoPath, (err, metadata) => {
      if (err) {
        fs.unlinkSync(tempVideoPath);
        return res.status(500).send('Error reading video metadata');
      }

      const duration = metadata.format.duration;
      const seekTime = Math.min(Math.max(duration / 2, 5), duration - 5);

      ffmpeg(tempVideoPath)
        .screenshots({
          timestamps: [seekTime],
          filename: path.basename(tempImagePath),
          folder: path.dirname(tempImagePath),
          size: '640x?',
        })
        .on('end', () => {
          res.sendFile(tempImagePath, () => {
            fs.unlinkSync(tempVideoPath);
            fs.unlinkSync(tempImagePath);
          });
        })
        .on('error', (e) => {
          fs.unlinkSync(tempVideoPath);
          if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
          res.status(500).send('Error generating screenshot');
        });
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Internal error');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server started at http://localhost:${port}`));
