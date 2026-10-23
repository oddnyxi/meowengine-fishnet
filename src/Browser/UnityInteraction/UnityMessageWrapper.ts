import MeowEngine from "../GlobalTypeDefs";

export class UnityMessageWrapper {

    static fly(): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage(
            'GameManager',
            'InstantiateSpectator'
        );
    }

    static unfly(): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage(
            'GameManager',
            'RespawnAsSpectator'
        );
    }

    static chat(m: string): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage(
            'Chatbox',
            'SelfSubmitMessage',
            m
        );
    }

    static respawn(): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage('PlayerBody(Clone)', 'Respawn');
    }

    static becomeMasterClient(): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage(
            'PlayerBody(Clone)',
            'BecomeMasterClient'
        );
    }

    static findNewMasterClient(): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage( 
            'PlayerBody(Clone)',
            'FindNewMasterClient'
        );
    }

    static addKillToKillstreak(): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage(
            'PlayerBody(Clone)',
            'AddKillToStreak'
        );
    }

    static local_EndMatch(): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage('Match Manager', 'EndMatch');
    }

    static clearFlashbangEffect(): void {
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return;
        }
        MeowEngine.UnityInstance.SendMessage(
            'GameManager/Overlay Canvas/Flash',
            'ClearFlash'
        );
    }

    static local_setTimeScale(v: number): boolean {
        const max: number = 1.3;
        const min: number = 0.2;
    
        if (typeof v !== 'number' || isNaN(v) || v > max || v < min) {
            if (MeowEngine.Log.Instance) {
                MeowEngine.Log.Instance.warn(`Invalid time scale: ${v}. Must be a number between ${min} and ${max}.`);
            } else {
                console.warn(`Invalid time scale: ${v}. Must be a number between ${min} and ${max}.`);
            }
            return false;
        }
    
        if (!MeowEngine.UnityInstance.SendMessage) {
            console.error('UnityInstance.SendMessage is not available');
            return false;
        }
    
        try {
            MeowEngine.UnityInstance.SendMessage(
                'PlayerBody(Clone)',
                'SetTimeScale',
                v
            );
            return true;
        } catch (error) {
            if (MeowEngine.Log.Instance) {
                MeowEngine.Log.Instance.error(`Failed to set time scale: ${(error as Error).message}`);
            } else {
                console.error(`Failed to set time scale: ${(error as Error).message}`);
            }
            return false;
        }
    }
}

export default UnityMessageWrapper;