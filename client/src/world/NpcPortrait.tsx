import { useState } from 'react';
import { NPC_PUBLIC, type NpcId } from '../../../shared/npc.ts';
import { npcIllustrationUrl } from '../../../shared/npc-portrait-illustrations.ts';

export function NpcPortrait({npcId}: {npcId: NpcId}) {
  const [failedNpc,setFailedNpc] = useState<NpcId | null>(null);
  const source = npcIllustrationUrl(npcId);
  const npc = NPC_PUBLIC.find(npc => npc.id === npcId);
  if(!source || failedNpc === npcId) return <span className="npc-portrait npc-portrait-unavailable" aria-hidden="true">{npc?.name.ko.slice(0,1) ?? '?'}</span>;
  return <img key={npcId} className="npc-portrait npc-portrait-illustrated" src={source} alt="" aria-hidden="true" draggable={false} onError={() => setFailedNpc(npcId)}/>;
}
