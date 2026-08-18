import type { CapacitorConfig } from '@capacitor/cli';



const config: CapacitorConfig = {

  appId: 'com.fundtrack.local',

  appName: 'FundTrack',

  webDir: 'dist',

  android: {

    allowMixedContent: true,

  },

  server: {

    androidScheme: 'http',

    cleartext: true,

  },

  plugins: {

    CapacitorNodeJS: {

      nodeDir: 'nodejs-project',

      startMode: 'auto',

    },

  },

};



export default config;

