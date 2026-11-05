/**
 * Message Class Types — model for .asmsag (SE91 message class) definitions
 */

export interface MessageDef {
    /** Three-character message number, e.g. '001' (SAP's own classes also use letters) */
    number: string;
    text: string;
    selfExplanatory: boolean;
}

export interface MessageClassDef {
    description: string;
    /** Sorted by number */
    messages: MessageDef[];
}

// SAP field limits (T100A-STEXT, T100-TEXT) and the message number width (T100-MSGNR).
export const MAX_DESCRIPTION_LENGTH = 60;
export const MAX_TEXT_LENGTH = 73;
export const MESSAGE_NUMBER_WIDTH = 3;
