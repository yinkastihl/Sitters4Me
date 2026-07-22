// globals.d.ts — place in root of ~/sitters4me/
// Declares global variables used across screens

declare global {
  var currentUser: {
    id?: number;
    fname?: string;
    lname?: string;
    email?: string;
    cellphone?: string;
    homephone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipcode?: string;
    kids?: number;
    status?: string;
    bgcheck?: string;
    user_type?: string;
    search_radius?: number;
    minrate?: number;
    maxrate?: number;
    work_distance?: number;
    about?: string;
    image?: string;
  } | undefined;
}

export {};
