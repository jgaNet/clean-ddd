export interface IUserProfile {
  email: string;
  nickname: string;
}

export interface IUser {
  _id: string;
  profile: IUserProfile;
}

export interface INewUser {
  profile: {
    email: string;
    nickname?: string;
  };
}
