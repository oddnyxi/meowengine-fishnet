#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Generates and saves a README.md with project information
 * @param {string} treeContent - The directory tree content as a string
 */
function generateReadme(treeContent) {
  const rootDir = process.cwd();
  const projectName = path.basename(rootDir);
  
  const readmeContent = `# MeowEngine Parcel
  
## ⚠️ HUGE NOTICE: This project is still a work in progress, things will be added here and there to make modding easier so don't go too crazy 

## Table of Contents
- [Disclaimer](#disclaimer)
- [Overview](#overview)
- [Features](#features)
- [SDK](#sdk)
- [Network Patches](#network-patches)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Development](#development)
- [Making Your Own Mod](#making-your-own-mod)
- [Player Management System](#player-management-system)
- [Contributing](#contributing)
- [License](#license)

A high-performance Bullet Force Cheat Engine rebuilt with Parcel bundler for optimized performance and enhanced code organization.

## ⚠️ Disclaimer: This project is intended for educational and personal use only.

- This custom mod base was created for a Unity Web game and is **not** designed to promote or enable the creation of malicious cheats or exploits.
 
## Overview

MeowEngine Parcel has been completely redesigned using Parcel bundler to deliver better performance, cleaner architecture, and improved maintainability. This implementation features optimized code organization and structural improvements to facilitate ongoing development.

![image](https://github.com/user-attachments/assets/f0ef4212-b009-4ccd-bb26-5892f643c023)
![image](https://github.com/user-attachments/assets/6b00b4a2-2f1c-4222-b75d-7159265919e3)
![Preview Video](https://github.com/user-attachments/assets/f7cf4f5f-96ba-4e07-9ac2-08db375e9bac)

## Features:

- **High Performance**: Rebuilt with Parcel for faster execution and efficient bundling
- **Clean Architecture**: Improved code structure and organization
- **Enhanced Maintainability**: Better organized components for easier future development
- **User Script Ready**: Compiles directly to a userscript format for quick installation

## SDK

MeowEngine includes a custom SDK for calling "mock" functions rebuilt in JavaScript from PhotonNetwork. This SDK implements a JavaScript version of networking functionality similar to Photon Network with the following key components:

- **Core Structure**: Organized into modules like \`InitOperations\`\, \`PairCalculation\`, \`LoadBalancingClient\`, and \`Networking\`
- **Network Communication**: Implements websocket connections to Photon servers
- **Cryptography Layer**: Features extensive encryption/decryption methods for various data types (integers, strings, vectors, etc.)
- **Configuration Options**: Includes debug mode flags and development settings

This custom implementation allows developers to use familiar Photon-style networking patterns while running in JavaScript environments.

![image](https://github.com/user-attachments/assets/51f54ed4-5392-4802-9a7c-da952a107cb5)

## Network Patches
- Check [Patching File](https://github.com/cyberarchives/meowengine-parcel/blob/main/src/MeowEngine/Patching/Entry.js) for more details

## Project Structure

\`\`\`
${treeContent}
\`\`\`

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [pnpm](https://pnpm.io/) package manager

### Setup

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/cyberarchives/meowengine-parcel.git
   cd meowengine-parcel
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

## Development

### Building

To build the project:

\`\`\`bash
pnpm build
\`\`\`

After building, check \`dist/meowengine.user.js\` for the built script that can be installed in userscript managers like Tampermonkey or Greasemonkey.

### Development Mode

To run in development mode with hot reloading:

\`\`\`bash
pnpm dev
\`\`\`

## Making Your Own Mod

### Key Files

- The main entry file is located at \`/src/index.js\`. This is where you can add or modify UI elements and core functionality.
- UI components can be found in the \`/src/components/\` directory.

### Getting Started with Modding

1. Begin by exploring \`/src/index.js\` which serves as the application's entry point.
2. To create new UI elements:
   - Look at [Examples.md](https://github.com/cyberarchives/meowengine-parcel/blob/main/src/Menu/Examples.md)

3. Modify existing features by editing the corresponding files in the core directory.

# Player Management System

## Overview
The MeowEngine includes a robust player management system that provides access to detailed player information across your game environment. This functionality is crucial for implementing multiplayer features, leaderboards, and player interactions.

## Accessing Players

You can retrieve all players in the current room instance using the following method:

\`\`\`javascript
function GetPlayers() {
   return MeowEngine.RoomInstance.Players;
}

const players = GetPlayers();
\`\`\`

## Player Object Structure

Each player is represented by an object containing the following properties:

| Property | Type | Description |
|----------|------|-------------|
| \`actorNr\` | Integer | Unique player identifier within the room |
| \`name\` | String | Player's display name |
| \`rank\` | Integer | Player's current ranking |
| \`kd\` | Float | Player's kill/death ratio |
| \`team\` | Integer | Team identifier (0, 1, etc.) |
| \`kills\` | Integer | Current kill count |
| \`platform\` | String | Platform identifier (e.g., "WebGLPlayer") |
| \`position\` | Object | Player's current position coordinates |
| \`rotation\` | Object | Player's current rotation values |
| \`pitch\` | Float | Player's current pitch angle |
| \`yaw\` | Float | Player's current yaw angle |
| \`health\` | Integer | Player's current health value |
| \`ping\` | Integer | Player's connection latency in ms |

## Example Output

\`\`\`javascript
[
    { // Not sure why the game does this, it sends you an empty player packet
        "13": {
            "actorNr": 13,
            "name": "",
            "rank": 0,
            "kd": 0,
            "team": 0,
            "kills": 0,
            "platform": "Unknown",
            "position": {
                "x": -17.88554573059082,
                "y": 1.6934276819229126,
                "z": 6.833706855773926
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 2950,
            "yaw": 3970,
            "health": 2264,
            "ping": 105
        }
    },
    {
        "11": {
            "actorNr": 11,
            "name": "PC-Fredrickbrown",
            "rank": 16,
            "kd": 0.6425120830535889,
            "team": 1,
            "kills": 0,
            "platform": "WebGLPlayer",
            "position": {
                "x": -42.128578186035156,
                "y": 5.438340663909912,
                "z": 24.576688766479492
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 1530,
            "yaw": 3224,
            "health": 10000,
            "ping": 204
        }
    },
    {
        "9": {
            "actorNr": 9,
            "name": "PC-chucky4",
            "rank": 35,
            "kd": 0.9057227969169617,
            "team": 1,
            "kills": 0,
            "platform": "WebGLPlayer",
            "position": {
                "x": -50.776187896728516,
                "y": 5.189589500427246,
                "z": -6.514407634735107
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 290,
            "yaw": -280,
            "health": null,
            "ping": 59
        }
    },
    {
        "8": {
            "actorNr": 8,
            "name": "PC-Nzeru",
            "rank": 16,
            "kd": 0.5938931107521057,
            "team": 0,
            "kills": 1,
            "platform": "WebGLPlayer",
            "position": {
                "x": -8.04712963104248,
                "y": 5.137051582336426,
                "z": 33.926910400390625
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 1550,
            "yaw": 255,
            "health": 10000,
            "ping": 62
        }
    },
    {
        "6": {
            "actorNr": 6,
            "name": "PC-eTurducken",
            "rank": 2,
            "kd": 0.4545454680919647,
            "team": 0,
            "kills": 0,
            "platform": "WebGLPlayer",
            "position": {
                "x": -62.402469635009766,
                "y": 5.1363139152526855,
                "z": 10.234478950500488
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 880,
            "yaw": 19,
            "health": 10000,
            "ping": 43
        }
    },
    {
        "4": {
            "actorNr": 4,
            "name": "PC-juicyshart",
            "rank": 9,
            "kd": 1.0656565427780151,
            "team": 0,
            "kills": 0,
            "platform": "WebGLPlayer",
            "position": {
                "x": -50.3499641418457,
                "y": 6.5234503746032715,
                "z": -13.241415023803711
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 1320,
            "yaw": -335,
            "health": 4427,
            "ping": 46
        }
    },
    {
        "3": {
            "actorNr": 3,
            "name": "PC-xxxxderrius",
            "rank": 1,
            "kd": 0,
            "team": 1,
            "kills": 0,
            "platform": "WebGLPlayer",
            "position": {
                "x": -18.738447189331055,
                "y": 1.6934278011322021,
                "z": 8.207507133483887
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 1200,
            "yaw": 2603,
            "health": null,
            "ping": 61
        }
    },
    {
        "1": {
            "actorNr": 1,
            "name": "PC-trauancoleman",
            "rank": 19,
            "kd": 0.17782217264175415,
            "team": 0,
            "kills": 0,
            "platform": "WebGLPlayer",
            "position": {
                "x": -8.79213809967041,
                "y": 5.137052059173584,
                "z": 35.69183349609375
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 2810,
            "yaw": 2965,
            "health": null,
            "ping": 105
        }
    },
    { // Not sure why the game does this, it sends you an empty player packet
        "14": {
            "actorNr": 14,
            "name": "",
            "rank": 0,
            "kd": 0,
            "team": 0,
            "kills": 0,
            "platform": "Unknown",
            "position": {},
            "rotation": {},
            "pitch": 0,
            "yaw": 0,
            "health": 0,
            "ping": 0
        }
    },
    {
        "15": {
            "actorNr": 15,
            "name": "PC-Leonardo128",
            "rank": 1,
            "kd": 0.5909090638160706,
            "team": 0,
            "kills": 0,
            "platform": "WebGLPlayer",
            "position": {
                "x": -40.76292419433594,
                "y": 6.83626651763916,
                "z": -27.654510498046875
            },
            "rotation": {
                "w": 1,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "pitch": 3100,
            "yaw": 3606,
            "health": 10000,
            "ping": 226
        }
    }
]
\`\`\`

## Common Use Cases

- **Team Assignment**: Filter players by their \`team\` property
- **Leaderboards**: Sort players based on \`rank\` or \`kd\` ratio
- **Proximity Features**: Calculate distances between players using \`position\` data

### Best Practices

- Keep UI components separate from core functionality
- Use the existing SDK for network-related operations
- Test thoroughly in development mode before building
- Consider adding comments to document your modifications

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
`;

  fs.writeFileSync(path.join(rootDir, 'README.md'), readmeContent);
  console.log(`\n✅ README.md successfully generated!`);
}

/**
 * Checks if a file/directory is hidden (starts with a dot)
 * @param {string} filename - Name of the file/directory
 * @returns {boolean} Whether the file/directory is hidden
 */
function isHidden(filename) {
  return filename.startsWith('.');
}

/**
 * Prints a directory tree in a formatted way and returns the tree content as a string
 * @returns {string} The directory tree content
 */
function generateDirectoryTree() {
  const rootDir = process.cwd();
  const baseName = path.basename(rootDir);
  
  let treeContent = `${baseName}/`;
  const lines = [];
  
  // Get all files/directories in the root directory
  const files = fs.readdirSync(rootDir);
  
  // Filter out hidden files (except .parcelrc which we want to include)
  const filteredFiles = files.filter(file => 
    !isHidden(file) || file === '.parcelrc'
  );
  
  // Sort directories first, then files
  const sortedItems = filteredFiles.sort((a, b) => {
    const aPath = path.join(rootDir, a);
    const bPath = path.join(rootDir, b);
    
    const aIsDir = fs.statSync(aPath).isDirectory();
    const bIsDir = fs.statSync(bPath).isDirectory();
    
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.localeCompare(b);
  });
  
  // Process each file/directory in root
  for (let i = 0; i < sortedItems.length; i++) {
    const file = sortedItems[i];
    const filePath = path.join(rootDir, file);
    const isDirectory = fs.statSync(filePath).isDirectory();
    const isLastItem = i === sortedItems.length - 1;
    
    // Generate comment for special files
    let comment = '';
    if (file === 'components' && isDirectory) comment = ' # UI components';
    else if (file === 'Components' && isDirectory) comment = ' # UI components';
    else if (file === 'core' && isDirectory) comment = ' # Core engine functionality';
    else if (file === 'utils' && isDirectory) comment = ' # Utility functions';
    else if (file === 'Utils' && isDirectory) comment = ' # Utility functions';
    else if (file === 'index.js') comment = ' # Main entry point';
    else if (file === 'Entry.js') comment = ' # Patch listeners (Add your own patches here)';
    else if (file === 'dist' && isDirectory) comment = ' # Built files';
    else if (file === '.parcelrc') comment = ' # Parcel configuration';
    else if (file === 'package.json') comment = ' # Project dependencies and scripts';
    
    // For node_modules, just display the directory without traversing
    if (file === 'node_modules' && isDirectory) {
      const itemPrefix = isLastItem ? '└── ' : '├── ';
      lines.push(`${itemPrefix}${file}/`);
      continue;
    }
    
    // Display current item with proper formatting
    const itemPrefix = isLastItem ? '└── ' : '├── ';
    const displayName = isDirectory ? `${file}/` : file;
    lines.push(`${itemPrefix}${displayName}${comment}`);
    
    // Recursively process directories
    if (isDirectory) {
      const newPrefix = isLastItem ? '    ' : '│   ';
      traverseDirectory(filePath, newPrefix, isLastItem, 1, lines);
    }
  }
  
  treeContent += '\n' + lines.join('\n');
  console.log(treeContent);
  return treeContent;
}

/**
 * Traverses a directory and builds its structure
 * @param {string} dirPath - Path to the directory
 * @param {string} prefix - Prefix for the current line
 * @param {boolean} isLastParent - Whether parent is the last item 
 * @param {number} depth - Current depth in the tree
 * @param {Array<string>} lines - Array to collect the output lines
 */
function traverseDirectory(dirPath, prefix, isLastParent, depth, lines = []) {
  if (depth > 20) {
    // Prevent infinite recursion (just in case)
    return;
  }

  try {
    const files = fs.readdirSync(dirPath);
    
    // Filter out hidden files and directories (except .parcelrc)
    const filteredFiles = files.filter(file => 
      !isHidden(file) || file === '.parcelrc'
    );
    
    // Sort directories first, then files
    const sortedItems = filteredFiles.sort((a, b) => {
      const aPath = path.join(dirPath, a);
      const bPath = path.join(dirPath, b);
      
      const aIsDir = fs.statSync(aPath).isDirectory();
      const bIsDir = fs.statSync(bPath).isDirectory();
      
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });
    
    // Process each file/directory
    for (let i = 0; i < sortedItems.length; i++) {
      const file = sortedItems[i];
      const filePath = path.join(dirPath, file);
      const isDirectory = fs.statSync(filePath).isDirectory();
      const isLastItem = i === sortedItems.length - 1;
      
      // For node_modules, just display the directory without traversing
      if (file === 'node_modules' && isDirectory) {
        const itemPrefix = isLastItem ? '└── ' : '├── ';
        lines.push(`${prefix}${itemPrefix}${file}/`);
        continue;
      }
      
      // Print the current item
      const itemPrefix = isLastItem ? '└── ' : '├── ';
      const displayName = isDirectory ? `${file}/` : file;
      
      // Check for special files to add comments
      let comment = '';
      if (file === 'components' && isDirectory) comment = ' # UI components';
      else if (file === 'Components' && isDirectory) comment = ' # UI components';
      else if (file === 'core' && isDirectory) comment = ' # Core engine functionality';
      else if (file === 'utils' && isDirectory) comment = ' # Utility functions';
      else if (file === 'Utils' && isDirectory) comment = ' # Utility functions';
      else if (file === 'index.js') comment = ' # Main entry point';
      else if (file === 'Entry.js') comment = ' # Patch listeners (Add your own patches here)';
      else if (file === 'dist' && isDirectory) comment = ' # Built files';
      else if (file === '.parcelrc') comment = ' # Parcel configuration';
      else if (file === 'package.json') comment = ' # Project dependencies and scripts';
      
      const line = `${prefix}${itemPrefix}${displayName}${comment}`;
      lines.push(line);
    
      // If it's a directory, traverse it
      if (isDirectory) {
        const newPrefix = `${prefix}${isLastItem ? '    ' : '│   '}`;
        traverseDirectory(filePath, newPrefix, isLastItem, depth + 1, lines);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}: ${error.message}`);
  }
}

// Run the script
const treeContent = generateDirectoryTree();
generateReadme(treeContent);
