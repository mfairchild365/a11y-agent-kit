import jwt

SECRET = "change-me"

def issue_tokens(user_id):
    access = jwt.encode({"sub": user_id, "typ": "access"}, SECRET, algorithm="HS256")
    refresh = jwt.encode({"sub": user_id, "typ": "refresh"}, SECRET, algorithm="HS256")
    return access, refresh

def refresh_access(refresh_token):
    claims = jwt.decode(refresh_token, SECRET, algorithms=["HS256"])
    if claims.get("typ") != "refresh":
        raise ValueError("not a refresh token")
    return issue_tokens(claims["sub"])[0]
