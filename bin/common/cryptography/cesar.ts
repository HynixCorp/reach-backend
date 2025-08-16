const cipherCesar = {
    // Function to encrypt UTF-8 data based on the length of a password (Cesar Cipher)
    //
    // Example:
    //
    // const text = 'Hello World' - Length of text is 11
    // const password = 'ABC' - Length of password is 3
    //
    // encrypt(text, password)
    //
    // Output: ©ÇÏÍÑ¸ÑÕÍÆ
    //
    encrypt: async function (text: string, password: string): Promise<string> {
        return new Promise((resolve) => {
            const cesarCipher = (text: string, shift: number): string => {
                const regex = /[a-zA-Z]/g;

                return text.replace(regex, (match) => {
                    const isUpperCase = match === match.toUpperCase();
                    const baseCharCode = isUpperCase ? "A".charCodeAt(0) : "a".charCodeAt(0);
                    const charCode = match.charCodeAt(0);
                    const shiftedCharCode =
                        ((charCode - baseCharCode + shift) % 26 + 26) % 26 + baseCharCode;
                    return String.fromCharCode(shiftedCharCode);
                });
            };

            const encryptedText = cesarCipher(text, password.length);

            resolve(encryptedText);
        });
    },

    // Function to decrypt UTF-8 data based on the length of a password (Cesar Cipher)
    //
    // Example:
    //
    // const text = '©ÇÏÍÑ¸ÑÕÍÆ'
    // const password = 'ABC' - Length of password is 3
    //
    // decrypt(text, password)
    //
    // Output: Hello World
    //
    decrypt: async function (text: string, password: string): Promise<string> {
        return new Promise((resolve) => {
            const cesarCipher = (text: string, shift: number): string => {
                const regex = /[a-zA-Z]/g;

                return text.replace(regex, (match) => {
                    const isUpperCase = match === match.toUpperCase();
                    const baseCharCode = isUpperCase ? "A".charCodeAt(0) : "a".charCodeAt(0);
                    const charCode = match.charCodeAt(0);
                    // Aplicamos el desplazamiento negativo en el descifrado
                    const shiftedCharCode =
                        ((charCode - baseCharCode - shift) % 26 + 26) % 26 + baseCharCode;
                    return String.fromCharCode(shiftedCharCode);
                });
            };

            const decryptedText = cesarCipher(text, password.length);

            resolve(decryptedText);
        });
    },
};

export const cryptManager = {
    start: function () {
        return {
            encrypt: cipherCesar.encrypt,
            decrypt: cipherCesar.decrypt,
        };
    },
};
