export interface UserProfileDTO {
  email: string;
  nickname: string;
}

export interface UserDTO {
  _id: string;
  profile: UserProfileDTO;
}

export interface NewUserDTO {
  profile: {
    email: string;
    nickname?: string;
  };
}
