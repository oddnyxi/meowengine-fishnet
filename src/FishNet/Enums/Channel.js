/**
 * FishNet transport channel (Runtime/Transporting/Channels.cs).
 * Over the Bayou WebSocket transport the channel id is appended as the LAST
 * byte of every WebSocket frame, even though WebSockets are always reliable.
 */
export const Channel = Object.freeze({
  Reliable: 0,
  Unreliable: 1,
});

export const channelName = (c) => (c === Channel.Reliable ? 'Reliable' : c === Channel.Unreliable ? 'Unreliable' : `Channel(${c})`);

export default Channel;
