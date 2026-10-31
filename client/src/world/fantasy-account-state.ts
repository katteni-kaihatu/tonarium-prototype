import type { get } from '../store.ts';
import { clearFantasyGmLife } from './fantasy-gm-history.ts';
import { clearNpcRequests } from './npc-request-tracker.ts';

type ClientState=ReturnType<typeof get>;
export const fantasyPrivateMessagesAllowed=(state:Pick<ClientState,'selfId'|'joined'|'wsConnected'|'wsReady'>)=>!!state.selfId&&state.joined&&state.wsConnected&&state.wsReady;

export function clearFantasyAccountPrivateState(owners:readonly (string|null|undefined)[]):Partial<ClientState>{
  for(const owner of new Set(owners.filter((value):value is string=>!!value))){clearFantasyGmLife(owner);clearNpcRequests(owner);}
  return {
    fantasyProfile:null,fantasyGuildGreeting:null,fantasyLegacies:[],fantasyRanking:null,fantasyContractBoard:null,fantasyContractError:null,
    fantasyParty:null,fantasyPartyError:null,fantasyPartyPending:false,fantasyTownPresence:null,
    fantasyCombat:null,fantasyCombatError:null,fantasyCombatPending:false,
    fantasyRealm:null,fantasyRealmPending:false,fantasyRealmError:null,
    fantasyProperties:null,fantasyPropertyPending:false,fantasyPropertyError:null,
    gmReply:null,dialogueProgress:{},gmPending:false,gmRequestId:null,gmError:null,gmErrorLocale:null,
    communityState:null,communityError:null,communityPending:false,fantasyError:null,fantasyPending:false,fantasyTestResetAllowed:false,
    npcMessages:[],npcPending:false,npcError:null,npcErrorContext:null,npcModel:'',npcRequestId:null,npcRelationships:{},
  };
}

export function fantasyAccountDisconnected(previous:Pick<ClientState,'selfId'>):Partial<ClientState>{
  return clearFantasyAccountPrivateState([previous.selfId]);
}
