//! The roles every context agrees on. A value the outside sends as a string reaches the domain
//! as a string; `Role::parse` is the guard that turns it into the enum, never a controller.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Role {
    Admin,
    User,
    Guest,
}

impl Role {
    pub const ALL: [Role; 3] = [Role::Admin, Role::User, Role::Guest];

    /// The name the outside world uses: the variant, in uppercase.
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Admin => "ADMIN",
            Role::User => "USER",
            Role::Guest => "GUEST",
        }
    }

    /// The type guard: a string that names a role, or nothing.
    pub fn parse(value: &str) -> Option<Role> {
        Self::ALL.into_iter().find(|role| role.as_str() == value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_named_in_uppercase_and_parsed_back_from_that_name_only() {
        assert_eq!(Role::Admin.as_str(), "ADMIN");
        assert_eq!(Role::parse("USER"), Some(Role::User));
        assert_eq!(Role::parse("user"), None);
    }
}
