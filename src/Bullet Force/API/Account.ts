import accountData from "./RegistrationData";

interface AccountContainer {
    username: string;
    password: string;
    hashedPassword: string;
    wasLoginSuccessful: boolean;
    accountNumber: number;
    locale: string;
}

interface BFAccountInfo {
    show: boolean;
    money: number;
    xp: number;
    streamer: boolean;
    deviceID: string;
    clan: string;
    cases: number;
    cases_CREDIT: number;
    cases_ADS: number;
    cases_OW: number;
    gold_OW: number;
    gold: number;
    totalGoldBought: number;
    hacker: boolean;
    v: string;
    platform: string;
    tKills: number;
    tDeaths: number;
    mWon: number;
    mLost: number;
    knifeKills: number;
    explKills: number;
    nukes: number;
    highStrk: string;
    mostKills: string;
    characterCamos: string;
    glovesCamos: string;
    bulletTracerColors: string;
    eLs: number;
    playerID: number;
    notificationMessage: string;
    dailyClawPlaysRemaining: number;
    rankTagOption: number;
}

interface WeaponInfo {
    weapon: number;
    unlocked: number;
    cOL: string;
    aOL: string;
    sOL: string;
    bOL: string;
    c: string;
    a: string;
    s: string;
    b: string;
}

interface ThrowableInfo {
    weapon: number;
    unlockedWeapon: number;
}

interface AccountInfoData {
    bfAccountInfo: BFAccountInfo;
    weaponInfo: WeaponInfo[];
    throwableInfo: ThrowableInfo[];
    os: string;
    model: string;
    rd: string;
    ed: string;
}

interface LoginResponse {
    status: number;
    acnumber?: string;
    locale?: string;
}

interface GameplayStats {
    totalKills: number;
    totalDeaths: number;
    matchesWon: number;
    matchesLost: number;
    knifeKills: number;
    explosiveKills: number;
    nukes: number;
    highestStreak: number;
    mostKillsInMatch: number;
    killDeathRatio: number;
    winLossRatio: number;
    totalMatches: number;
    winRate: number;
}

interface Currency {
    money: number;
    gold: number;
    goldOW: number;
    totalGoldBought: number;
    experiencePoints: number;
    energyLevels: number;
}

interface AllCases {
    gold: number;
    credit: number;
    ads: number;
    overwatch: number;
    total: number;
}

interface WeaponCustomizations {
    camo: string;
    attachment: string;
    sight: string;
    barrel: string;
}

interface UnlockedWeapon {
    id: number;
    customizations: WeaponCustomizations;
}

interface WeaponStats {
    totalWeapons: number;
    unlockedWeapons: number;
    weaponDetails: Array<{
        id: number;
        unlocked: boolean;
        hasCustomizations: boolean;
    }>;
}

interface ProfileInfo {
    playerID: number;
    clan: string;
    isStreamer: boolean;
    isHacker: boolean;
    platform: string;
    version: string;
    deviceID: string;
    rankTagOption: number;
    dailyClawPlaysRemaining: number;
    notificationMessage: string;
}

interface Cosmetics {
    characterCamos: string[];
    glovesCamos: string[];
    bulletTracerColors: string[];
}

interface Efficiency {
    killEfficiency: number;
    winEfficiency: number;
    specialKillsPercentage: number;
    averageKillsPerMatch: number;
}

interface Progression {
    level: number;
    totalWealth: number;
    experiencePoints: number;
    combatExperience: number;
    veteranStatus: string;
}

interface PerformanceAnalysis {
    skillLevel: string;
    efficiency: Efficiency;
    progression: Progression;
    recommendations: string[];
}

interface ComparisonMetric<T> {
    mine: T;
    theirs: T;
    advantage: T;
}

interface AccountComparison {
    kills: ComparisonMetric<number>;
    kdr: ComparisonMetric<number>;
    winRate: ComparisonMetric<number>;
    summary: string;
}

interface QuickStatus {
    status: string;
    money?: number;
    gold?: number;
    totalCases?: number;
    kdr?: number;
    winRate?: number;
    lastUpdated?: string;
}

interface ExportedAccountData {
    exportDate: string;
    username: string;
    accountNumber: number;
    rawData: AccountInfoData;
    processedData: {
        gameplayStats: GameplayStats;
        currency: Currency;
        profile: ProfileInfo;
        cosmetics: Cosmetics;
    };
}

type CaseType = "gold" | "credit" | "ads" | "ow";
type SkillLevel = "Expert" | "Advanced" | "Intermediate" | "Beginner" | "Novice";

class Account {
    private username: string;
    private password: string;
    private hashedPassword: string;
    private requiredForMobile: number;
    
    public container: AccountContainer;

    constructor(username: string, password: string) {
        this.username = username;
        this.password = password;
        this.requiredForMobile = new Date().getTime();
        this.hashedPassword = "";
        
        this.container = {
            username: "",
            password: "",
            hashedPassword: "",
            wasLoginSuccessful: false,
            accountNumber: 0,
            locale: "gorb"
        };

        this.initHashedPassword(password);
    }

    private async initHashedPassword(password: string): Promise<void> {
        this.hashedPassword = await this.hashString(password);
    }

    private async hashString(input: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-512', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static async hashSHA512(input: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-512', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static async getMultiplayerAuthCode(username: string, password: string): Promise<string> {
        const hashedPassword = await this.hashSHA512(password);
        const response = await fetch("https://server.blayzegames.com/OnlineAccountSystem/get_multiplayer_auth_code.php?requiredForMobile=1856338943", {
            headers: {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9,ja;q=0.8",
                "content-type": "application/x-www-form-urlencoded",
                "Referer": "https://bullet-force-multiplayer.game-files.crazygames.com/",
            },
            body: `password=${hashedPassword}&username=${username}&username=${username}&password=${hashedPassword}`,
            method: "POST"
        });

        const authCode = await response.text();
        return authCode;
    }

    private getRequestConfig(body: string | null = null): RequestInit {
        const config: RequestInit = {
            headers: {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9,ja;q=0.8",
                "content-type": "application/x-www-form-urlencoded",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "cross-site",
                "Referer": "https://bullet-force-multiplayer.game-files.crazygames.com/"
            },
            method: "POST"
        };
        
        if (body) config.body = body;
        return config;
    }

    private async makeRequest(endpoint: string, body: string | null = null): Promise<Response> {
        const url = `https://server.blayzegames.com/OnlineAccountSystem/${endpoint}?requiredForMobile=${this.requiredForMobile}`;
        return fetch(url, this.getRequestConfig(body));
    }

    async register(): Promise<boolean> {
        const body = accountData.getTemplate(this.username, this.hashedPassword);
        const response = await this.makeRequest("register.php", body);
        const text = await response.text();
        
        if (text.includes("MySQL error 1062") || text === "fail") return false;
        return text === "success";
    }

    async registerAndLogin(): Promise<AccountContainer | false> {
        const registered = await this.register();
        return registered ? await this.tryLogin() : false;
    }

    async tryLogin(): Promise<AccountContainer> {
        const body = `username=${this.username}&password=${this.hashedPassword}&store=BALYZE_WEB&useJSON=true&locale=english&tutorialr=1&crazyGamesToken=`;
        const response = await this.makeRequest("login.php", body);
        const json: LoginResponse = await response.json();

        const isSuccess = json.status === 1;
        
        Object.assign(this.container, {
            accountNumber: isSuccess ? parseInt(json.acnumber || "0") : 0,
            username: this.username,
            password: this.password,
            hashedPassword: this.hashedPassword || "",
            locale: isSuccess ? (json.locale || "english") : "N/A",
            wasLoginSuccessful: isSuccess
        });

        return this.container;
    }

    async getCaseCount(type: CaseType = "gold"): Promise<number> {
        if (!["gold", "credit", "ads", "ow"].includes(type)) {
            throw new Error("Invalid case type. Must be: gold, credit, ads, or ow");
        }

        const accountInfo = await this.getAccountInfo();
        
        switch (type) {
            case "gold":
                return accountInfo.bfAccountInfo.cases;
            case "credit":
                return accountInfo.bfAccountInfo.cases_CREDIT;
            case "ads":
                return accountInfo.bfAccountInfo.cases_ADS;
            case "ow":
                return accountInfo.bfAccountInfo.cases_OW;
            default:
                return 0;
        }
    }

    async getGameplayStats(): Promise<GameplayStats> {
        const accountInfo = await this.getAccountInfo();
        const stats = accountInfo.bfAccountInfo;
        
        return {
            totalKills: parseInt(stats.tKills.toString()) || 0,
            totalDeaths: parseInt(stats.tDeaths.toString()) || 0,
            matchesWon: parseInt(stats.mWon.toString()) || 0,
            matchesLost: parseInt(stats.mLost.toString()) || 0,
            knifeKills: parseInt(stats.knifeKills.toString()) || 0,
            explosiveKills: parseInt(stats.explKills.toString()) || 0,
            nukes: parseInt(stats.nukes.toString()) || 0,
            highestStreak: parseInt(stats.highStrk) || 0,
            mostKillsInMatch: parseInt(stats.mostKills) || 0,
            killDeathRatio: this.calculateKDR(stats.tKills, stats.tDeaths),
            winLossRatio: this.calculateWLR(stats.mWon, stats.mLost),
            totalMatches: (parseInt(stats.mWon.toString()) || 0) + (parseInt(stats.mLost.toString()) || 0),
            winRate: this.calculateWinRate(stats.mWon, stats.mLost)
        };
    }

    private calculateKDR(kills: number, deaths: number): number {
        const k = parseInt(kills.toString()) || 0;
        const d = parseInt(deaths.toString()) || 0;
        return d === 0 ? k : parseFloat((k / d).toFixed(2));
    }

    private calculateWLR(wins: number, losses: number): number {
        const w = parseInt(wins.toString()) || 0;
        const l = parseInt(losses.toString()) || 0;
        return l === 0 ? w : parseFloat((w / l).toFixed(2));
    }

    private calculateWinRate(wins: number, losses: number): number {
        const w = parseInt(wins.toString()) || 0;
        const l = parseInt(losses.toString()) || 0;
        const total = w + l;
        return total === 0 ? 0 : parseFloat(((w / total) * 100).toFixed(1));
    }

    async getCurrency(): Promise<Currency> {
        const accountInfo = await this.getAccountInfo();
        return {
            money: parseInt(accountInfo.bfAccountInfo.money.toString()) || 0,
            gold: parseInt(accountInfo.bfAccountInfo.gold.toString()) || 0,
            goldOW: parseInt(accountInfo.bfAccountInfo.gold_OW.toString()) || 0,
            totalGoldBought: parseInt(accountInfo.bfAccountInfo.totalGoldBought.toString()) || 0,
            experiencePoints: parseInt(accountInfo.bfAccountInfo.xp.toString()) || 0,
            energyLevels: parseInt(accountInfo.bfAccountInfo.eLs.toString()) || 0
        };
    }

    async getAllCases(): Promise<AllCases> {
        const accountInfo = await this.getAccountInfo();
        return {
            gold: parseInt(accountInfo.bfAccountInfo.cases.toString()) || 0,
            credit: parseInt(accountInfo.bfAccountInfo.cases_CREDIT.toString()) || 0,
            ads: parseInt(accountInfo.bfAccountInfo.cases_ADS.toString()) || 0,
            overwatch: parseInt(accountInfo.bfAccountInfo.cases_OW.toString()) || 0,
            total: (parseInt(accountInfo.bfAccountInfo.cases.toString()) || 0) +
                   (parseInt(accountInfo.bfAccountInfo.cases_CREDIT.toString()) || 0) +
                   (parseInt(accountInfo.bfAccountInfo.cases_ADS.toString()) || 0) +
                   (parseInt(accountInfo.bfAccountInfo.cases_OW.toString()) || 0)
        };
    }

    async getWeaponStats(weaponId: number | null = null): Promise<WeaponInfo | WeaponStats | null> {
        const accountInfo = await this.getAccountInfo();
        const weapons = accountInfo.weaponInfo;
        
        if (weaponId !== null) {
            const weapon = weapons.find(w => w.weapon === weaponId);
            return weapon || null;
        }
        
        return {
            totalWeapons: weapons.length,
            unlockedWeapons: weapons.filter(w => w.unlocked === 1).length,
            weaponDetails: weapons.map(w => ({
                id: w.weapon,
                unlocked: w.unlocked === 1,
                hasCustomizations: !!(w.c || w.a || w.s || w.b)
            }))
        };
    }

    async getUnlockedWeapons(): Promise<UnlockedWeapon[]> {
        const accountInfo = await this.getAccountInfo();
        return accountInfo.weaponInfo
            .filter(weapon => weapon.unlocked === 1)
            .map(weapon => ({
                id: weapon.weapon,
                customizations: {
                    camo: weapon.c || "none",
                    attachment: weapon.a || "none",
                    sight: weapon.s || "none",
                    barrel: weapon.b || "none"
                }
            }));
    }

    async getProfileInfo(): Promise<ProfileInfo> {
        const accountInfo = await this.getAccountInfo();
        const stats = accountInfo.bfAccountInfo;
        
        return {
            playerID: parseInt(stats.playerID.toString()) || 0,
            clan: stats.clan || "None",
            isStreamer: stats.streamer || false,
            isHacker: stats.hacker || false,
            platform: stats.platform || "Unknown",
            version: stats.v || "Unknown",
            deviceID: stats.deviceID || "Not set",
            rankTagOption: parseInt(stats.rankTagOption.toString()) || -2,
            dailyClawPlaysRemaining: parseInt(stats.dailyClawPlaysRemaining.toString()) || 0,
            notificationMessage: stats.notificationMessage || ""
        };
    }

    async getCosmetics(): Promise<Cosmetics> {
        const accountInfo = await this.getAccountInfo();
        const stats = accountInfo.bfAccountInfo;
        
        return {
            characterCamos: this.parseCosmetics(stats.characterCamos),
            glovesCamos: this.parseCosmetics(stats.glovesCamos),
            bulletTracerColors: this.parseCosmetics(stats.bulletTracerColors)
        };
    }

    private parseCosmetics(cosmeticString: string): string[] {
        if (!cosmeticString || cosmeticString === "") return [];
        return cosmeticString.split(',').filter(item => item.trim() !== "");
    }

    async getPerformanceAnalysis(): Promise<PerformanceAnalysis> {
        const stats = await this.getGameplayStats();
        const currency = await this.getCurrency();
        
        return {
            skillLevel: this.calculateSkillLevel(stats),
            efficiency: this.calculateEfficiency(stats),
            progression: this.calculateProgression(currency, stats),
            recommendations: this.generateRecommendations(stats)
        };
    }

    private calculateSkillLevel(stats: GameplayStats): SkillLevel {
        const kdr = stats.killDeathRatio;
        const winRate = stats.winRate;
        const avgKills = stats.totalMatches > 0 ? stats.totalKills / stats.totalMatches : 0;
        
        if (kdr >= 2.0 && winRate >= 70 && avgKills >= 15) return "Expert";
        if (kdr >= 1.5 && winRate >= 60 && avgKills >= 10) return "Advanced";
        if (kdr >= 1.0 && winRate >= 50 && avgKills >= 7) return "Intermediate";
        if (kdr >= 0.7 && winRate >= 35) return "Beginner";
        return "Novice";
    }

    private calculateEfficiency(stats: GameplayStats): Efficiency {
        const specialKillsRatio = stats.totalKills > 0 ? 
            (stats.knifeKills + stats.explosiveKills) / stats.totalKills * 100 : 0;
        
        return {
            killEfficiency: stats.killDeathRatio,
            winEfficiency: stats.winRate,
            specialKillsPercentage: parseFloat(specialKillsRatio.toFixed(1)),
            averageKillsPerMatch: stats.totalMatches > 0 ? 
                parseFloat((stats.totalKills / stats.totalMatches).toFixed(1)) : 0
        };
    }

    private calculateProgression(currency: Currency, stats: GameplayStats): Progression {
        const totalWealth = currency.money + (currency.gold * 100);
        const experienceLevel = Math.floor(currency.experiencePoints / 1000);
        
        return {
            level: experienceLevel,
            totalWealth,
            experiencePoints: currency.experiencePoints,
            combatExperience: stats.totalKills + stats.totalDeaths,
            veteranStatus: stats.totalMatches >= 100 ? "Veteran" : "Regular"
        };
    }

    private generateRecommendations(stats: GameplayStats): string[] {
        const recommendations: string[] = [];
        
        if (stats.killDeathRatio < 1.0) {
            recommendations.push("Focus on improving survival skills and positioning");
        }
        
        if (stats.winRate < 50) {
            recommendations.push("Work on team coordination and objective play");
        }
        
        if (stats.knifeKills === 0) {
            recommendations.push("Try to get some knife kills for style points");
        }
        
        if (stats.highestStreak < 5) {
            recommendations.push("Focus on staying alive longer to build kill streaks");
        }
        
        if (stats.totalMatches < 50) {
            recommendations.push("Keep playing to gain more experience");
        }
        
        return recommendations.length > 0 ? recommendations : ["Keep up the great work!"];
    }

    async compareWith(otherAccount: Account): Promise<AccountComparison> {
        const myStats = await this.getGameplayStats();
        const otherStats = await otherAccount.getGameplayStats();
        
        return {
            kills: {
                mine: myStats.totalKills,
                theirs: otherStats.totalKills,
                advantage: myStats.totalKills - otherStats.totalKills
            },
            kdr: {
                mine: myStats.killDeathRatio,
                theirs: otherStats.killDeathRatio,
                advantage: parseFloat((myStats.killDeathRatio - otherStats.killDeathRatio).toFixed(2))
            },
            winRate: {
                mine: myStats.winRate,
                theirs: otherStats.winRate,
                advantage: parseFloat((myStats.winRate - otherStats.winRate).toFixed(1))
            },
            summary: this.getComparisonSummary(myStats, otherStats)
        };
    }

    private getComparisonSummary(myStats: GameplayStats, otherStats: GameplayStats): string {
        const myScore = myStats.killDeathRatio + (myStats.winRate / 100) + (myStats.totalKills / 1000);
        const otherScore = otherStats.killDeathRatio + (otherStats.winRate / 100) + (otherStats.totalKills / 1000);
        
        if (myScore > otherScore * 1.1) return "You're significantly better!";
        if (myScore > otherScore) return "You have a slight edge";
        if (myScore < otherScore * 0.9) return "They're significantly better";
        return "You're evenly matched";
    }

    async exportAccountData(): Promise<ExportedAccountData> {
        const [accountInfo, gameplayStats, currency, profile, cosmetics] = await Promise.all([
            this.getAccountInfo(),
            this.getGameplayStats(),
            this.getCurrency(),
            this.getProfileInfo(),
            this.getCosmetics()
        ]);
        
        return {
            exportDate: new Date().toISOString(),
            username: this.username,
            accountNumber: this.container.accountNumber,
            rawData: accountInfo,
            processedData: {
                gameplayStats,
                currency,
                profile,
                cosmetics
            }
        };
    }

    isLoggedIn(): boolean {
        return this.container.wasLoginSuccessful;
    }

    getAccountNumber(): number {
        return this.container.accountNumber;
    }

    getLocale(): string {
        return this.container.locale;
    }

    async getQuickStatus(): Promise<QuickStatus> {
        if (!this.isLoggedIn()) {
            return { status: "Not logged in" };
        }
        
        const [currency, cases, stats] = await Promise.all([
            this.getCurrency(),
            this.getAllCases(),
            this.getGameplayStats()
        ]);
        
        return {
            status: "Active",
            money: currency.money,
            gold: currency.gold,
            totalCases: cases.total,
            kdr: stats.killDeathRatio,
            winRate: stats.winRate,
            lastUpdated: new Date().toISOString()
        };
    }

    private async getAccountInfo(customData: AccountInfoData | null = null): Promise<AccountInfoData> {
        const defaultAccountData: AccountInfoData = {
            "bfAccountInfo": {
                "show": false,
                "money": 0,
                "xp": 0,
                "streamer": false,
                "deviceID": "",
                "clan": "",
                "cases": 0,
                "cases_CREDIT": 0,
                "cases_ADS": 0,
                "cases_OW": 0,
                "gold_OW": 0,
                "gold": 0,
                "totalGoldBought": 0,
                "hacker": false,
                "v": "1.0",
                "platform": "",
                "tKills": 0,
                "tDeaths": 0,
                "mWon": 0,
                "mLost": 0,
                "knifeKills": 0,
                "explKills": 0,
                "nukes": 0,
                "highStrk": "0",
                "mostKills": "0",
                "characterCamos": "",
                "glovesCamos": "",
                "bulletTracerColors": "",
                "eLs": 0,
                "playerID": 0,
                "notificationMessage": "",
                "dailyClawPlaysRemaining": 0,
                "rankTagOption": -2
            },
            "weaponInfo": Array.from({length: 73}, (_, i) => ({
                "weapon": i,
                "unlocked": 0,
                "cOL": "0,0,0",
                "aOL": "0,0,0",
                "sOL": "0,0,0",
                "bOL": "0,0,0",
                "c": "",
                "a": "",
                "s": "",
                "b": ""
            })),
            "throwableInfo": [{"weapon": 0, "unlockedWeapon": 0}],
            "os": "not set",
            "model": "not set",
            "rd": "0",
            "ed": "0"
        };

        const accountInfoData = customData || defaultAccountData;
        
        const body = `username=${this.username}&password=${this.hashedPassword}&newJSON=${encodeURIComponent(JSON.stringify(accountInfoData))}&rankTag=-2&crazyGamesUserToken=`;
        
        try {
            const response = await this.makeRequest("get_account_info_json.php", body);
            const result = (await response.text()).split("%%fieldSeparator%%")[2];
            
            try {
                return JSON.parse(result) as AccountInfoData;
            } catch {
                throw new Error("Failed to parse account info JSON");
            }
        } catch (error) {
            throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

export default Account;
export type {
    AccountContainer,
    BFAccountInfo,
    WeaponInfo,
    ThrowableInfo,
    AccountInfoData,
    GameplayStats,
    Currency,
    AllCases,
    UnlockedWeapon,
    WeaponStats,
    ProfileInfo,
    Cosmetics,
    PerformanceAnalysis,
    AccountComparison,
    QuickStatus,
    ExportedAccountData,
    CaseType,
    SkillLevel
};