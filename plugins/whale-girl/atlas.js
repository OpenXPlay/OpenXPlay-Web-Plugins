// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

// Embedded descriptor avoids loading JSON through a blocked connection API.
export default {
  "image": "assets/whale-girl-atlas.webp",
  "cellWidth": 192,
  "cellHeight": 208,
  "columns": 8,
  "rows": [
    {
      "state": "idle",
      "frames": 6,
      "fps": 4,
      "loop": true
    },
    {
      "state": "running-right",
      "frames": 8,
      "fps": 6,
      "loop": true
    },
    {
      "state": "running-left",
      "frames": 8,
      "fps": 6,
      "loop": true
    },
    {
      "state": "waving",
      "frames": 4,
      "fps": 6,
      "loop": false
    },
    {
      "state": "jumping",
      "frames": 5,
      "fps": 6,
      "loop": false
    },
    {
      "state": "busy",
      "frames": 8,
      "fps": 6,
      "loop": true
    },
    {
      "state": "startled",
      "frames": 6,
      "fps": 6,
      "loop": true
    },
    {
      "state": "thinking",
      "frames": 6,
      "fps": 4,
      "loop": true
    },
    {
      "state": "happy",
      "frames": 6,
      "fps": 6,
      "loop": false
    },
    {
      "state": "listening",
      "frames": 8,
      "fps": 4,
      "loop": true
    },
    {
      "state": "drowsy",
      "frames": 8,
      "fps": 4,
      "loop": true
    }
  ]
};
