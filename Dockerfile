FROM node:8

# Create app directory
WORKDIR /opt/dojot-media-server

# Install app dependencies
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .
#RUN npm install

# Start app
CMD [ "npm", "start" ]
