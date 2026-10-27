import type { FantasyAccountPublic } from '../../../shared/fantasy-account.ts';
import type { User } from '../../../shared/protocol.ts';
import type { get } from '../store.ts';
import { clearFantasyGmLife } from './fantasy-gm-history.ts';
import { clearNpcRequests } from './npc-request-tracker.ts';

type ClientState=ReturnType<typeof get>;
type Identity=Pick<ClientState,'selfId'|'fantasyHomeId'|'fantasyAccount'|'users'>;
export interface FantasyAccountIdentityMessage {account:FantasyAccountPublic|null;homeId:string;activeId:string;error?:string;user?:User}

export const fantasyReconnectIdentity=(state:Pick<Identity,'selfId'|'fantasyHomeId'>)=>state.fantasyHomeId??state.selfId;
export const fantasyPrivateMessagesAllowed=(state:Pick<ClientState,'selfId'|'fantasyAccount'|'fantasyAccountReady'>)=>!!state.fantasyAccountReady&&!!state.fantasyAccount&&state.selfId===state.fantasyAccount.principal;

export function clearFantasyAccountPrivateState(owners:readonly (string|null|undefined)[]):Partial<ClientState>{
  for(const owner of new Set(owners.filter((value):value is string=>!!value))){clearFantasyGmLife(owner);clearNpcRequests(owner);}
  return {
    fantasyProfile:null,fantasyLegacies:[],fantasyContractBoard:null,fantasyContractError:null,
    fantasyParty:null,fantasyPartyError:null,fantasyPartyPending:false,
    fantasyCombat:null,fantasyCombatError:null,fantasyCombatPending:false,
    fantasyRealm:null,fantasyRealmPending:false,fantasyRealmError:null,
    fantasyProperties:null,fantasyPropertyPending:false,fantasyPropertyError:null,
    gmReply:null,dialogueProgress:{},gmPending:false,gmRequestId:null,gmError:null,gmErrorLocale:null,
    communityState:null,communityError:null,communityPending:false,fantasyError:null,fantasyPending:false,
    npcMessages:[],npcPending:false,npcError:null,npcErrorContext:null,npcModel:'',npcRequestId:null,npcRelationships:{},
  };
}

export function fantasyAccountIdentityUpdate(previous:Identity,message:FantasyAccountIdentityMessage):{changed:boolean;patch:Partial<ClientState>}{
  const changed=previous.selfId!==message.activeId||previous.fantasyAccount?.id!==message.account?.id||previous.fantasyAccount?.principal!==message.account?.principal;
  return {changed,patch:{
    ...(changed?clearFantasyAccountPrivateState([previous.selfId,previous.fantasyAccount?.principal,message.activeId,message.account?.principal]):{}),
    selfId:message.activeId,fantasyAccount:message.account,fantasyHomeId:message.account?message.homeId:null,
    fantasyAccountReady:true,fantasyAccountError:message.error??null,
    ...(message.user?.id===message.activeId?{users:previous.users.some(user=>user.id===message.activeId)?previous.users.map(user=>user.id===message.activeId?message.user!:user):[...previous.users,message.user]}:{}),
  }};
}

export function fantasyAccountDisconnected(previous:Identity):Partial<ClientState>{
  return {...clearFantasyAccountPrivateState([previous.selfId,previous.fantasyAccount?.principal]),fantasyAccount:null,fantasyAccountReady:false,fantasyAccountError:null};
}
