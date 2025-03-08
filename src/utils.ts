export function generateRandomString(length: number): string {
    const charset =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let randomString = "";

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        randomString += charset[randomIndex];
    }

    return randomString;
}

export function addaccountlog(
    // deno-lint-ignore no-explicit-any
    db: any,
    userid: string,
    title: string,
    message: string,
) {
    const currentUTCDate = new Date();
    const date = currentUTCDate.toISOString().slice(0, 19)
        .replace("T", " ");

    db.query(
        `INSERT INTO accountlogs (userid, title, message, date) VALUES (?, ?, ?, ?)`,
        [userid, title, message, date],
    );
}